import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PhotoCleanupModal } from "@/components/PhotoCleanupModal";
import { cleanupPhotoFile, FULL_FRAME_CROP, renderCleanupPreview } from "@/lib/image-cleanup";

// jsdom has no PointerEvent; back it with MouseEvent so pointer coordinates
// (clientX/clientY) reach the crop overlay under test.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  Object.defineProperty(window, "PointerEvent", { value: PointerEventPolyfill, writable: true });
}

jest.mock("lucide-react", () => new Proxy({}, {
  get: () => {
    const MockIcon = () => <span data-testid="icon" />;
    return MockIcon;
  },
}));

jest.mock("@/lib/image-cleanup", () => {
  const actual = jest.requireActual("@/lib/image-cleanup");
  return {
    ...actual,
    renderCleanupPreview: jest.fn().mockResolvedValue(undefined),
    cleanupPhotoFile: jest.fn(),
  };
});

const mockedPreview = renderCleanupPreview as jest.MockedFunction<typeof renderCleanupPreview>;
const mockedCleanup = cleanupPhotoFile as jest.MockedFunction<typeof cleanupPhotoFile>;

const photo = new File([new Uint8Array([1, 2, 3])], "form.png", { type: "image/png" });

/** Overlay container mocked to a 200x100 box so drags map to normalized coords. */
const RECT = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) };

/** Drag the se corner handle from the corner to 75% width / 80% height. */
function dragCropSmaller() {
  const handle = screen.getByTestId("crop-handle-se");
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 100 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 150, clientY: 80 });
  fireEvent.pointerUp(handle, { pointerId: 1 });
}

const CROPPED = { x: 0, y: 0, width: 0.75, height: 0.8 };

describe("PhotoCleanupModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPreview.mockResolvedValue(undefined);
    jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue(RECT as DOMRect);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the copy, preview, and controls with document mode on by default", async () => {
    render(<PhotoCleanupModal file={photo} onConfirm={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByRole("heading", { name: "Clean up photo" })).toBeInTheDocument();
    expect(screen.getByText("Rotate, crop, or improve the photo before adding it as a document page.")).toBeInTheDocument();
    expect(screen.getByTestId("photo-cleanup-preview")).toBeInTheDocument();
    expect(screen.getByTestId("crop-overlay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rotate left" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rotate right" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Document mode" })).toBeChecked();
    expect(screen.queryByRole("button", { name: "Reset crop" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockedPreview).toHaveBeenCalledWith(
        photo,
        { rotateQuarterTurns: 0, documentMode: true, cropRect: FULL_FRAME_CROP },
        expect.anything()
      );
    });
  });

  it("rotate buttons update the preview orientation", async () => {
    render(<PhotoCleanupModal file={photo} onConfirm={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Rotate right" }));
    await waitFor(() => {
      expect(mockedPreview).toHaveBeenCalledWith(
        photo,
        { rotateQuarterTurns: 1, documentMode: true, cropRect: FULL_FRAME_CROP },
        expect.anything()
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Rotate left" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate left" }));
    await waitFor(() => {
      expect(mockedPreview).toHaveBeenCalledWith(
        photo,
        { rotateQuarterTurns: 3, documentMode: true, cropRect: FULL_FRAME_CROP },
        expect.anything()
      );
    });
  });

  it("document mode toggle updates the preview", async () => {
    render(<PhotoCleanupModal file={photo} onConfirm={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Document mode" }));

    expect(screen.getByRole("checkbox", { name: "Document mode" })).not.toBeChecked();
    await waitFor(() => {
      expect(mockedPreview).toHaveBeenCalledWith(
        photo,
        { rotateQuarterTurns: 0, documentMode: false, cropRect: FULL_FRAME_CROP },
        expect.anything()
      );
    });
  });

  it("cropping updates the preview and reveals Reset crop", async () => {
    render(<PhotoCleanupModal file={photo} onConfirm={jest.fn()} onCancel={jest.fn()} />);

    dragCropSmaller();

    expect(screen.getByRole("button", { name: "Reset crop" })).toBeInTheDocument();
    await waitFor(() => {
      expect(mockedPreview).toHaveBeenCalledWith(
        photo,
        { rotateQuarterTurns: 0, documentMode: true, cropRect: CROPPED },
        expect.anything()
      );
    });
  });

  it("Reset crop restores the full frame and hides itself", async () => {
    render(<PhotoCleanupModal file={photo} onConfirm={jest.fn()} onCancel={jest.fn()} />);

    dragCropSmaller();
    fireEvent.click(screen.getByRole("button", { name: "Reset crop" }));

    expect(screen.queryByRole("button", { name: "Reset crop" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockedPreview).toHaveBeenLastCalledWith(
        photo,
        { rotateQuarterTurns: 0, documentMode: true, cropRect: FULL_FRAME_CROP },
        expect.anything()
      );
    });
  });

  it("rotating resets the crop to full frame", async () => {
    render(<PhotoCleanupModal file={photo} onConfirm={jest.fn()} onCancel={jest.fn()} />);

    dragCropSmaller();
    fireEvent.click(screen.getByRole("button", { name: "Rotate right" }));

    expect(screen.queryByRole("button", { name: "Reset crop" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockedPreview).toHaveBeenLastCalledWith(
        photo,
        { rotateQuarterTurns: 1, documentMode: true, cropRect: FULL_FRAME_CROP },
        expect.anything()
      );
    });
  });

  it("Use photo passes the crop rect into cleanup", async () => {
    const cleaned = new File([new Uint8Array([9])], "form.jpg", { type: "image/jpeg" });
    mockedCleanup.mockResolvedValue(cleaned);
    const onConfirm = jest.fn();

    render(<PhotoCleanupModal file={photo} onConfirm={onConfirm} onCancel={jest.fn()} />);
    dragCropSmaller();
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));

    await waitFor(() => {
      expect(mockedCleanup).toHaveBeenCalledWith(photo, {
        rotateQuarterTurns: 0,
        documentMode: true,
        cropRect: CROPPED,
      });
    });
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(cleaned);
    });
  });

  it("Use photo returns the cleaned file with the chosen options", async () => {
    const cleaned = new File([new Uint8Array([9])], "form.jpg", { type: "image/jpeg" });
    mockedCleanup.mockResolvedValue(cleaned);
    const onConfirm = jest.fn();

    render(<PhotoCleanupModal file={photo} onConfirm={onConfirm} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rotate right" }));
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));

    await waitFor(() => {
      expect(mockedCleanup).toHaveBeenCalledWith(photo, {
        rotateQuarterTurns: 1,
        documentMode: true,
        cropRect: FULL_FRAME_CROP,
      });
    });
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(cleaned);
    });
  });

  it("falls back to the original photo when cleanup fails", async () => {
    mockedCleanup.mockRejectedValue(new Error("boom"));
    const onConfirm = jest.fn();

    render(<PhotoCleanupModal file={photo} onConfirm={onConfirm} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(photo);
    });
  });

  it("Cancel aborts without confirming", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(<PhotoCleanupModal file={photo} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
