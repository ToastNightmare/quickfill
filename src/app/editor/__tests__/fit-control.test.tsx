import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import EditorPage from "../page";
import { loadZoomFromLocalStorage, saveZoomToLocalStorage } from "@/lib/persistence";

// PR #93: the Fit control must actually recompute the viewer's fit scale
// (not only reset the zoom percentage), and mobile/tablet cold loads start
// at fit-to-width instead of a restored zoom that can clip the page.

jest.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock("next/link", () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

jest.mock("lucide-react", () => new Proxy({}, {
  get: () => {
    const MockIcon = () => <span data-testid="icon" />;
    return MockIcon;
  },
}));

jest.mock("@/components/UploadZone", () => ({
  UploadZone: ({ onFileLoad }: { onFileLoad: (upload: { pdfBytes: ArrayBuffer; fileName: string; skipAcroFormDetection?: boolean }) => void }) => (
    <button
      type="button"
      onClick={() => onFileLoad({ pdfBytes: new ArrayBuffer(8), fileName: "test.pdf" })}
    >
      Mock upload
    </button>
  ),
}));

jest.mock("@/components/MobileFiller", () => ({
  MobileFiller: () => null,
}));

jest.mock("@/components/Toolbar", () => ({
  Toolbar: () => null,
}));

const refitMock = jest.fn();
// Captures the latest props passed to the mocked PdfViewer so tests can
// drive the gesture callbacks (PR #94 pinch zoom wiring).
const viewerPropsRef: { current: Record<string, unknown> } = { current: {} };

jest.mock("@/components/PdfViewer", () => {
  const React = jest.requireActual("react");
  return {
    PdfViewer: React.forwardRef(function MockPdfViewer(props: Record<string, unknown>, ref: React.Ref<unknown>) {
      React.useEffect(() => {
        viewerPropsRef.current = props;
      });
      React.useImperativeHandle(ref, () => ({
        getCanvasDataURL: () => "data:image/png;base64,base",
        getCanvasDimensions: () => ({ width: 100, height: 100 }),
        getCanvas: () => null,
        getViewportDims: () => ({ width: 100, height: 100 }),
        editField: jest.fn(),
        getCompositePreviewURL: jest.fn().mockResolvedValue(null),
        refit: refitMock,
      }));
      return <div data-testid="pdf-viewer" />;
    }),
  };
});

jest.mock("@/components/ContextPanel", () => ({
  ContextPanel: () => null,
}));

jest.mock("@/components/SignatureModal", () => ({
  SignatureModal: () => null,
}));

jest.mock("@/components/WelcomeModal", () => ({
  WelcomeModal: () => null,
}));

jest.mock("@/components/TourModal", () => ({
  TourModal: () => null,
}));

jest.mock("@/components/SupportForm", () => ({
  SupportForm: () => null,
}));

jest.mock("@/lib/use-history", () => ({
  useHistory: () => ({
    fields: [],
    set: jest.fn(),
    undo: jest.fn(),
    redo: jest.fn(),
    reset: jest.fn(),
    canUndo: false,
    canRedo: false,
  }),
}));

jest.mock("@/lib/persistence", () => ({
  savePdfToIndexedDB: jest.fn().mockResolvedValue(undefined),
  loadPdfFromIndexedDB: jest.fn().mockResolvedValue(null),
  saveFieldsToLocalStorage: jest.fn(),
  loadFieldsFromLocalStorage: jest.fn(() => []),
  savePageToLocalStorage: jest.fn(),
  loadPageFromLocalStorage: jest.fn(() => 0),
  saveFileNameToLocalStorage: jest.fn(),
  loadFileNameFromLocalStorage: jest.fn(() => "test.pdf"),
  clearEditorState: jest.fn().mockResolvedValue(undefined),
  saveZoomToLocalStorage: jest.fn(),
  loadZoomFromLocalStorage: jest.fn(() => 150),
  cleanupOldIndexedDBSessions: jest.fn(),
}));

jest.mock("@/lib/pdf-utils", () => ({
  detectAcroFormFields: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/analytics", () => ({
  trackEvent: jest.fn(),
}));

jest.mock("@/lib/meta-pixel", () => ({
  trackMetaEvent: jest.fn(),
}));

jest.mock("@/lib/editor-profile-autofill", () => ({
  runEditorProfileAutofill: jest.fn(),
  trackEditorAutofillShadowReport: jest.fn(),
}));

jest.mock("@/lib/templates-config", () => ({
  getTemplateBySlug: jest.fn(),
  isTemplateFillable: jest.fn(),
}));

jest.mock("@/lib/pdfjs-client", () => ({
  loadPdfjsClient: jest.fn().mockResolvedValue({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 100, height: 100 }),
        }),
      }),
    }),
  }),
}));

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

describe("Editor Fit control and initial fit", () => {
  const originalFetch = global.fetch;
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setViewportWidth(originalInnerWidth);
  });

  it("Fit resets zoom to 100% and asks the viewer to recompute its fit scale", async () => {
    setViewportWidth(1280);
    render(<EditorPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
    await waitFor(() => {
      expect(screen.getByTestId("pdf-viewer")).toBeInTheDocument();
    });

    // Desktop restores the saved zoom (150) on load.
    expect(screen.getByText("150%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fit document to screen width" }));

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(refitMock).toHaveBeenCalledTimes(1);
  });

  it("mobile/tablet cold load ignores a restored zoom and starts at fit-to-width (100%)", async () => {
    setViewportWidth(390);
    render(<EditorPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
    await waitFor(() => {
      expect(screen.getByTestId("pdf-viewer")).toBeInTheDocument();
    });

    // Saved zoom is 150, but mobile cold load must start at fit (100%).
    expect(loadZoomFromLocalStorage).toBeDefined();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByText("150%")).not.toBeInTheDocument();
  });

  it("desktop cold load keeps the restored zoom", async () => {
    setViewportWidth(1280);
    render(<EditorPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
    await waitFor(() => {
      expect(screen.getByTestId("pdf-viewer")).toBeInTheDocument();
    });

    expect(screen.getByText("150%")).toBeInTheDocument();
  });
});

describe("Editor pinch zoom gesture wiring (PR #94)", () => {
  const originalFetch = global.fetch;
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setViewportWidth(originalInnerWidth);
  });

  async function openEditor(width = 1280) {
    setViewportWidth(width);
    const view = render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
    await waitFor(() => {
      expect(screen.getByTestId("pdf-viewer")).toBeInTheDocument();
    });
    return view;
  }

  it("pinch preview overrides the zoom readout and clears when the gesture ends", async () => {
    await openEditor();
    expect(screen.getByText("150%")).toBeInTheDocument();

    const preview = viewerPropsRef.current.onGestureZoomPreview as (z: number | null) => void;
    act(() => preview(163));
    expect(screen.getByText("163%")).toBeInTheDocument();
    expect(screen.queryByText("150%")).not.toBeInTheDocument();

    // Gesture ended without a zoom change: readout returns to committed zoom.
    act(() => preview(null));
    expect(screen.getByText("150%")).toBeInTheDocument();
  });

  it("gesture commit updates the zoom, clamps to 50-200, and persists", async () => {
    await openEditor();

    const commit = viewerPropsRef.current.onGestureZoomCommit as (z: number) => void;

    act(() => commit(137.4));
    expect(screen.getByText("137%")).toBeInTheDocument();
    await waitFor(() => {
      expect(saveZoomToLocalStorage).toHaveBeenCalledWith(137);
    });

    act(() => commit(999));
    expect(screen.getByText("200%")).toBeInTheDocument();

    act(() => commit(3));
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("gesture commit clears any in-progress pinch preview", async () => {
    await openEditor();

    const preview = viewerPropsRef.current.onGestureZoomPreview as (z: number | null) => void;
    const commit = viewerPropsRef.current.onGestureZoomCommit as (z: number) => void;

    act(() => preview(176));
    expect(screen.getByText("176%")).toBeInTheDocument();

    act(() => commit(180));
    expect(screen.getByText("180%")).toBeInTheDocument();
    expect(screen.queryByText("176%")).not.toBeInTheDocument();
  });
});

describe("Editor gesture discovery hint (PR #94)", () => {
  const originalFetch = global.fetch;
  const originalInnerWidth = window.innerWidth;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    // Simulate a touch device (coarse pointer).
    window.matchMedia = jest.fn((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      onchange: null,
      dispatchEvent: jest.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.matchMedia = originalMatchMedia;
    setViewportWidth(originalInnerWidth);
  });

  async function openEditor() {
    setViewportWidth(390);
    const view = render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
    await waitFor(() => {
      expect(screen.getByTestId("pdf-viewer")).toBeInTheDocument();
    });
    return view;
  }

  it("shows the pinch/pan hint once on touch devices and never again", async () => {
    const first = await openEditor();
    expect(
      await screen.findByText("Pinch to zoom. Use two fingers to move around.")
    ).toBeInTheDocument();
    expect(localStorage.getItem("quickfill_gesture_hint_seen")).toBe("1");
    first.unmount();

    await openEditor();
    expect(
      screen.queryByText("Pinch to zoom. Use two fingers to move around.")
    ).not.toBeInTheDocument();
  });
});
