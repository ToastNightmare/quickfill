import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EditorPage from "../page";
import { removePageFromDocument } from "@/lib/document-intake";
import { savePdfToIndexedDB, saveFieldsToLocalStorage } from "@/lib/persistence";

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
  Toolbar: ({ onRemovePage, canRemovePage }: { onRemovePage?: () => void; canRemovePage?: boolean }) => (
    <button type="button" onClick={onRemovePage} disabled={!canRemovePage}>
      Mock remove page
    </button>
  ),
}));

jest.mock("@/components/PdfViewer", () => {
  const React = jest.requireActual("react");
  return {
    PdfViewer: React.forwardRef(function MockPdfViewer(
      props: { onTotalPagesChange?: (pages: number) => void },
      ref: React.Ref<unknown>
    ) {
      React.useImperativeHandle(ref, () => ({
        getCanvasDataURL: () => "data:image/png;base64,base",
        getCanvasDimensions: () => ({ width: 100, height: 100 }),
        getCanvas: () => null,
        getViewportDims: () => ({ width: 100, height: 100 }),
        editField: jest.fn(),
        getCompositePreviewURL: jest.fn().mockResolvedValue("data:image/png;base64,composite"),
      }));
      const onTotalPagesChange = props.onTotalPagesChange;
      React.useEffect(() => {
        onTotalPagesChange?.(3);
      }, [onTotalPagesChange]);
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

jest.mock("@/components/DownloadPreviewGate", () => ({
  DownloadPreviewGate: () => null,
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
        numPages: 3,
        getPage: async () => ({
          getViewport: () => ({ width: 100, height: 100 }),
        }),
      }),
    }),
  }),
}));

jest.mock("@/lib/document-intake", () => {
  const actual = jest.requireActual("@/lib/document-intake");
  return {
    ...actual,
    removePageFromDocument: jest.fn(),
  };
});

const mockedRemove = removePageFromDocument as jest.MockedFunction<typeof removePageFromDocument>;
const mockedSavePdf = savePdfToIndexedDB as jest.MockedFunction<typeof savePdfToIndexedDB>;
const mockedSaveFields = saveFieldsToLocalStorage as jest.MockedFunction<typeof saveFieldsToLocalStorage>;

async function loadEditorWithDocument() {
  render(<EditorPage />);
  fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
  // Wait until the mocked viewer has reported totalPages so the action is enabled.
  await waitFor(() => {
    const buttons = screen.getAllByRole("button", { name: "Mock remove page" });
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(false);
  });
}

describe("Editor remove page", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("shows the confirmation modal with the cannot-be-undone warning", async () => {
    await loadEditorWithDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Mock remove page" })[0]);

    expect(await screen.findByRole("heading", { name: /Remove page 1 of 3\?/ })).toBeInTheDocument();
    expect(screen.getByText(/This cannot be undone\./)).toBeInTheDocument();
  });

  it("cancel closes the modal without touching the document", async () => {
    await loadEditorWithDocument();

    const fieldSavesBefore = mockedSaveFields.mock.calls.length;
    fireEvent.click(screen.getAllByRole("button", { name: "Mock remove page" })[0]);
    await screen.findByRole("heading", { name: /Remove page 1 of 3\?/ });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /Remove page 1 of 3\?/ })).not.toBeInTheDocument();
    });
    expect(mockedRemove).not.toHaveBeenCalled();
    expect(mockedSaveFields.mock.calls.length).toBe(fieldSavesBefore);
  });

  it("confirm removes the page, persists, and shows the toast", async () => {
    const newBytes = new ArrayBuffer(16);
    mockedRemove.mockResolvedValue({ pdfBytes: newBytes, newPageCount: 2 });

    await loadEditorWithDocument();

    const fieldSavesBefore = mockedSaveFields.mock.calls.length;
    fireEvent.click(screen.getAllByRole("button", { name: "Mock remove page" })[0]);
    await screen.findByRole("heading", { name: /Remove page 1 of 3\?/ });
    fireEvent.click(screen.getByRole("button", { name: "Remove Page" }));

    await waitFor(() => {
      expect(mockedRemove).toHaveBeenCalledWith(expect.any(ArrayBuffer), 0);
    });
    await waitFor(() => {
      expect(mockedSavePdf).toHaveBeenCalledWith(newBytes);
    });
    expect(mockedSaveFields.mock.calls.length).toBeGreaterThan(fieldSavesBefore);
    expect(mockedSaveFields).toHaveBeenLastCalledWith([]);
    expect(await screen.findByText("Page removed")).toBeInTheDocument();
    expect((await screen.findAllByText(/Page 1 of 2/))[0]).toBeInTheDocument();
  });

  it("shows an error toast and keeps the document when removal fails", async () => {
    mockedRemove.mockRejectedValue(new Error("This page could not be removed. Please try again."));

    await loadEditorWithDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Mock remove page" })[0]);
    await screen.findByRole("heading", { name: /Remove page 1 of 3\?/ });
    const savesBefore = mockedSavePdf.mock.calls.length;
    const fieldSavesBefore = mockedSaveFields.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Remove Page" }));

    expect(await screen.findByText(/could not be removed/)).toBeInTheDocument();
    expect(mockedSavePdf.mock.calls.length).toBe(savesBefore);
    expect(mockedSaveFields.mock.calls.length).toBe(fieldSavesBefore);
  });
});
