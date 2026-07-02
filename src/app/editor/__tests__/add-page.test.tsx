import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EditorPage from "../page";
import { appendUploadToDocument, DocumentIntakeError } from "@/lib/document-intake";
import { savePdfToIndexedDB } from "@/lib/persistence";

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
  Toolbar: ({ onAddPage, isAddingPage }: { onAddPage?: () => void; isAddingPage?: boolean }) => (
    <button type="button" onClick={onAddPage} disabled={isAddingPage}>
      Mock add page
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

jest.mock("@/components/DownloadPreviewGate", () => ({
  DownloadPreviewGate: () => null,
}));

jest.mock("@/components/PhotoCleanupModal", () => ({
  PhotoCleanupModal: ({
    file,
    onConfirm,
    onCancel,
  }: {
    file: File;
    onConfirm: (cleaned: File) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="photo-cleanup-modal">
      <button type="button" onClick={() => onConfirm(new File([new Uint8Array([7])], `cleaned-${file.name}`, { type: "image/jpeg" }))}>
        Mock use photo
      </button>
      <button type="button" onClick={onCancel}>Mock cancel photo</button>
    </div>
  ),
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

jest.mock("@/lib/document-intake", () => {
  const actual = jest.requireActual("@/lib/document-intake");
  return {
    ...actual,
    appendUploadToDocument: jest.fn(),
  };
});

const mockedAppend = appendUploadToDocument as jest.MockedFunction<typeof appendUploadToDocument>;
const mockedSavePdf = savePdfToIndexedDB as jest.MockedFunction<typeof savePdfToIndexedDB>;

function pickAddPageFile(name = "page2.png", type = "image/png") {
  const input = screen.getByTestId("add-page-input");
  const file = new File([new Uint8Array([1, 2, 3])], name, { type });
  fireEvent.change(input, { target: { files: [file] } });
}

async function confirmPhotoCleanup() {
  await screen.findByTestId("photo-cleanup-modal");
  fireEvent.click(screen.getByRole("button", { name: "Mock use photo" }));
}

describe("Editor add page", () => {
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

  it("appends pages, persists the merged PDF, and jumps to the first new page", async () => {
    const mergedBytes = new ArrayBuffer(24);
    mockedAppend.mockResolvedValue({
      pdfBytes: mergedBytes,
      addedPageCount: 2,
      firstAddedPageIndex: 1,
    });

    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
    await screen.findAllByRole("button", { name: "Mock add page" });

    pickAddPageFile();
    await confirmPhotoCleanup();

    await waitFor(() => {
      expect(mockedAppend).toHaveBeenCalledTimes(1);
    });
    expect((mockedAppend.mock.calls[0][1] as File).name).toBe("cleaned-page2.png");
    await waitFor(() => {
      expect(mockedSavePdf).toHaveBeenCalledWith(mergedBytes);
    });
    expect(await screen.findByText("2 pages added")).toBeInTheDocument();
    expect((await screen.findAllByText(/Page 2 of 3/))[0]).toBeInTheDocument();
  });

  it("appends PDF files directly without the cleanup modal", async () => {
    mockedAppend.mockResolvedValue({
      pdfBytes: new ArrayBuffer(16),
      addedPageCount: 1,
      firstAddedPageIndex: 1,
    });

    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
    await screen.findAllByRole("button", { name: "Mock add page" });

    pickAddPageFile("extra.pdf", "application/pdf");

    await waitFor(() => {
      expect(mockedAppend).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("photo-cleanup-modal")).not.toBeInTheDocument();
    expect((mockedAppend.mock.calls[0][1] as File).name).toBe("extra.pdf");
  });

  it("cancelling photo cleanup aborts the add-page flow", async () => {
    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
    await screen.findAllByRole("button", { name: "Mock add page" });

    pickAddPageFile();
    await screen.findByTestId("photo-cleanup-modal");
    fireEvent.click(screen.getByRole("button", { name: "Mock cancel photo" }));

    await waitFor(() => {
      expect(screen.queryByTestId("photo-cleanup-modal")).not.toBeInTheDocument();
    });
    expect(mockedAppend).not.toHaveBeenCalled();
  });

  it("shows a single-page toast when one page is added", async () => {
    mockedAppend.mockResolvedValue({
      pdfBytes: new ArrayBuffer(16),
      addedPageCount: 1,
      firstAddedPageIndex: 1,
    });

    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
    await screen.findAllByRole("button", { name: "Mock add page" });

    pickAddPageFile();
    await confirmPhotoCleanup();

    expect(await screen.findByText("Page added")).toBeInTheDocument();
  });

  it("keeps the current document and shows an error when the merge is too large", async () => {
    mockedAppend.mockRejectedValue(
      new DocumentIntakeError(
        "Adding this page would make the document larger than 15MB. Try a smaller or compressed photo, or start a new file.",
        "merged_too_large"
      )
    );

    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
    await screen.findAllByRole("button", { name: "Mock add page" });

    const savesBefore = mockedSavePdf.mock.calls.length;
    pickAddPageFile();
    await confirmPhotoCleanup();

    expect(await screen.findByText(/larger than 15MB/)).toBeInTheDocument();
    expect(mockedSavePdf.mock.calls.length).toBe(savesBefore);
    expect(screen.queryByText(/Page added/)).not.toBeInTheDocument();
  });
});
