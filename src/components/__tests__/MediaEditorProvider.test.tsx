import "@testing-library/jest-dom";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import {
  MediaEditorBoundary,
  useOptionalMediaEditor,
} from "@/components/MediaEditorProvider";
import { MediaOverlayLayer } from "@/components/MediaOverlayLayer";
import {
  RasterSanitizationCoordinator,
  type SanitizedRaster,
} from "@/lib/media-sanitize";

const mockSanitize = jest.fn();
const mockDispose = jest.fn();

jest.mock("@/lib/media-sanitize", () => {
  const actual = jest.requireActual("@/lib/media-sanitize");
  return {
    ...actual,
    RasterSanitizationCoordinator: jest.fn().mockImplementation(() => ({
      sanitize: mockSanitize,
      dispose: mockDispose,
    })),
  };
});

function sanitizedRaster(
  marker: string,
  mimeType: "image/png" | "image/jpeg" = "image/png",
): Readonly<SanitizedRaster> {
  const bytes = Uint8Array.from(
    Array.from(marker, (character) => character.charCodeAt(0)),
  );
  return Object.freeze({
    bytes,
    blob: new Blob([bytes], { type: mimeType }),
    format: mimeType === "image/png" ? "png" : "jpeg",
    mimeType,
    width: 400,
    height: 200,
    sourceFormat: "webp",
    sourceWidth: 400,
    sourceHeight: 200,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function ContextProbe() {
  const media = useOptionalMediaEditor();
  if (!media) return <div data-testid="media-context">off</div>;
  const selected = media.overlays.find(
    ({ assetId }) => assetId === media.selectedAssetId,
  );
  const selectedRecord = selected ? media.getAsset(selected.assetId) : null;
  return (
    <div>
      <div data-testid="media-context">on</div>
      <div data-testid="media-count">{media.overlays.length}</div>
      <div data-testid="media-name">{selectedRecord?.descriptor.fileName ?? ""}</div>
      <button
        type="button"
        onClick={() => {
          if (media.selectedAssetId) media.deleteAsset(media.selectedAssetId);
        }}
      >
        Probe delete
      </button>
    </div>
  );
}

function renderBoundary({
  enabled = true,
  documentRevision = 1,
  onMessage = jest.fn(),
  withOverlay = false,
  strict = false,
}: {
  enabled?: boolean;
  documentRevision?: number;
  onMessage?: jest.Mock;
  withOverlay?: boolean;
  strict?: boolean;
} = {}) {
  const boundary = (
    <MediaEditorBoundary
      enabled={enabled}
      documentRevision={documentRevision}
      currentPage={0}
      getPageBounds={(pageIndex) =>
        pageIndex === 0 ? { widthPts: 600, heightPts: 800 } : null
      }
      onMessage={onMessage}
    >
      <ContextProbe />
      {withOverlay && (
        <div style={{ position: "relative", width: 600, height: 800 }}>
          <MediaOverlayLayer
            currentPage={0}
            renderedPageSize={{ width: 600, height: 800 }}
            pageBounds={{ widthPts: 600, heightPts: 800 }}
            interactionEnabled
          />
        </div>
      )}
    </MediaEditorBoundary>
  );
  return render(strict ? <StrictMode>{boundary}</StrictMode> : boundary);
}

async function chooseFile(name = "source.webp", type = "image/webp") {
  const file = new File(["unsanitized-source"], name, { type });
  fireEvent.change(screen.getByTestId("add-media-input"), {
    target: { files: [file] },
  });
  return file;
}

describe("MediaEditorBoundary", () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const createObjectURL = jest.fn(() => "blob:sanitized-test");
  const revokeObjectURL = jest.fn();

  beforeAll(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
  });

  afterAll(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates no media provider, input, coordinator, or URL while default-off", () => {
    renderBoundary({ enabled: false });
    expect(screen.getByTestId("media-context")).toHaveTextContent("off");
    expect(screen.queryByTestId("add-media-input")).not.toBeInTheDocument();
    expect(RasterSanitizationCoordinator).not.toHaveBeenCalled();
    expect(mockSanitize).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("exposes one semantic JPEG/PNG/WebP input only while enabled", () => {
    renderBoundary();
    const input = screen.getByTestId("add-media-input");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
    );
    expect(input).toHaveAccessibleName(
      "Choose a JPEG, PNG, or static WebP to add to the PDF",
    );
    expect(RasterSanitizationCoordinator).toHaveBeenCalledTimes(1);
  });

  it("recreates local resources during Strict Mode effect replay", async () => {
    mockSanitize.mockResolvedValueOnce(sanitizedRaster("strict"));
    renderBoundary({ strict: true });
    await chooseFile("strict.png", "image/png");

    await waitFor(() =>
      expect(screen.getByTestId("media-name")).toHaveTextContent("strict.png"),
    );
    expect(mockSanitize).toHaveBeenCalledTimes(1);
    expect(RasterSanitizationCoordinator).toHaveBeenCalledTimes(2);
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it("sanitizes exactly once and stores only the sanitized Blob/descriptor", async () => {
    mockSanitize.mockResolvedValueOnce(sanitizedRaster("safe"));
    renderBoundary();
    const file = await chooseFile();

    await waitFor(() => expect(screen.getByTestId("media-count")).toHaveTextContent("1"));
    expect(mockSanitize).toHaveBeenCalledTimes(1);
    expect(mockSanitize).toHaveBeenCalledWith(file);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const storedBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(storedBlob).not.toBe(file);
    expect(storedBlob.type).toBe("image/png");
    expect(screen.getByTestId("media-name")).toHaveTextContent("source.png");
  });

  it("fails closed without creating a URL when sanitization fails", async () => {
    const onMessage = jest.fn();
    mockSanitize.mockRejectedValueOnce(new Error("decoder failed"));
    renderBoundary({ onMessage });
    await chooseFile("bad.png", "image/png");

    await waitFor(() => expect(onMessage).toHaveBeenCalled());
    expect(screen.getByTestId("media-count")).toHaveTextContent("0");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("publishes only the newest selection when an older result resolves late", async () => {
    const first = deferred<Readonly<SanitizedRaster>>();
    const second = deferred<Readonly<SanitizedRaster>>();
    mockSanitize
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderBoundary();

    await chooseFile("first.webp");
    await chooseFile("second.webp");
    await act(async () => {
      second.resolve(sanitizedRaster("second"));
      await second.promise;
    });
    await waitFor(() => expect(screen.getByTestId("media-name")).toHaveTextContent("second.png"));
    await act(async () => {
      first.resolve(sanitizedRaster("first"));
      await first.promise;
    });

    expect(screen.getByTestId("media-count")).toHaveTextContent("1");
    expect(screen.getByTestId("media-name")).toHaveTextContent("second.png");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("cancels publication and releases resources on unmount", async () => {
    const pending = deferred<Readonly<SanitizedRaster>>();
    mockSanitize.mockReturnValueOnce(pending.promise);
    const view = renderBoundary();
    await chooseFile();
    view.unmount();
    await act(async () => {
      pending.resolve(sanitizedRaster("late"));
      await pending.promise;
    });

    expect(mockDispose).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("revokes URLs after deletion and document replacement", async () => {
    mockSanitize
      .mockResolvedValueOnce(sanitizedRaster("first"))
      .mockResolvedValueOnce(sanitizedRaster("second"));
    const view = renderBoundary();
    await chooseFile("first.png", "image/png");
    await waitFor(() => expect(screen.getByTestId("media-count")).toHaveTextContent("1"));
    fireEvent.click(screen.getByRole("button", { name: "Probe delete" }));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sanitized-test");

    await chooseFile("second.png", "image/png");
    await waitFor(() => expect(screen.getByTestId("media-count")).toHaveTextContent("1"));
    view.rerender(
      <MediaEditorBoundary
        enabled
        documentRevision={2}
        currentPage={0}
        getPageBounds={(pageIndex) =>
          pageIndex === 0 ? { widthPts: 600, heightPts: 800 } : null
        }
        onMessage={jest.fn()}
      >
        <ContextProbe />
      </MediaEditorBoundary>,
    );
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it("renders sanitized media and supports rotate, flip, Undo, Redo, and delete", async () => {
    mockSanitize.mockResolvedValueOnce(sanitizedRaster("safe"));
    renderBoundary({ withOverlay: true });
    await chooseFile();

    const overlay = await screen.findByTestId("media-overlay");
    expect(screen.getByTestId("sanitized-media-image")).toHaveAttribute(
      "src",
      "blob:sanitized-test",
    );
    expect(screen.getByRole("toolbar", { name: "Selected media controls" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Rotate media right" }));
    expect(await screen.findByTestId("media-overlay")).toHaveAttribute(
      "data-media-rotation",
      "90",
    );
    fireEvent.click(screen.getByRole("button", { name: "Flip media horizontally" }));
    expect(await screen.findByTestId("media-overlay")).toHaveAttribute(
      "data-media-flip-x",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo media change" }));
    expect(await screen.findByTestId("media-overlay")).toHaveAttribute(
      "data-media-flip-x",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Redo media change" }));
    expect(await screen.findByTestId("media-overlay")).toHaveAttribute(
      "data-media-flip-x",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete media" }));
    expect(screen.queryByTestId("media-overlay")).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sanitized-test");
    expect(overlay).not.toBeInTheDocument();
  });
});
