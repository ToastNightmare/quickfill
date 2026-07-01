import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EditorPage from "../page";

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
  Toolbar: ({ onDownload, isDownloading }: { onDownload: () => void; isDownloading?: boolean }) => (
    <button type="button" onClick={onDownload} disabled={isDownloading}>
      Mock download
    </button>
  ),
}));

jest.mock("@/components/PdfViewer", () => {
  const React = jest.requireActual("react");
  return {
    PdfViewer: React.forwardRef(function MockPdfViewer(_props: unknown, ref: React.Ref<unknown>) {
      React.useImperativeHandle(ref, () => ({
        getCanvasDataURL: () => "data:image/png;base64,base",
        getCanvasDimensions: () => ({ width: 100, height: 100 }),
        getCanvas: () => null,
        getViewportDims: () => ({ width: 100, height: 100 }),
        editField: jest.fn(),
        getCompositePreviewURL: jest.fn().mockResolvedValue("data:image/png;base64,composite"),
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
  loadZoomFromLocalStorage: jest.fn(() => 100),
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

function mockFetchForUsage(usage: Record<string, unknown>) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/signature") {
      return { ok: false, json: async () => ({}) } as Response;
    }
    if (url === "/api/usage") {
      return { ok: true, json: async () => usage } as Response;
    }
    if (url === "/api/fill-pdf") {
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
}

describe("Editor download gate", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:download"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("shows the preview gate for non-Pro users at the free limit", async () => {
    mockFetchForUsage({ isPro: false, tier: "user", used: 3, limit: 3 });
    render(<EditorPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
    fireEvent.click((await screen.findAllByRole("button", { name: "Mock download" }))[0]);

    expect(await screen.findByRole("heading", { name: "Your document is ready" })).toBeInTheDocument();
    expect(await screen.findByAltText("Document preview")).toHaveAttribute("src", "data:image/png;base64,composite");
  });

  it("does not show the preview gate for Pro downloads", async () => {
    mockFetchForUsage({ isPro: true, tier: "pro", used: 0, limit: 3 });
    render(<EditorPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
    fireEvent.click((await screen.findAllByRole("button", { name: "Mock download" }))[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/fill-pdf", expect.objectContaining({ method: "POST" }));
    });
    expect(screen.queryByRole("heading", { name: "Your document is ready" })).not.toBeInTheDocument();
  });
});
