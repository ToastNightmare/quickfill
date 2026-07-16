import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EditorPage from "../page";
import {
  createDocumentRevision,
  createFieldSuggestionId,
  type FieldSuggestion,
} from "@/lib/field-suggestions";
import {
  FIELD_SUGGESTION_INTENT_KEY,
  isFieldSuggestionReviewEnabled,
  storeFieldSuggestionIntent,
} from "@/lib/field-suggestion-rollout";
import { detectLocalFieldSuggestions } from "@/lib/local-field-suggestion-provider";
import {
  loadPdfFromIndexedDB,
  saveFieldsToLocalStorage,
} from "@/lib/persistence";
import type { EditorField } from "@/lib/types";

const mockGetCompositePreviewURL = jest.fn().mockResolvedValue("data:image/png;base64,preview");

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
  UploadZone: ({ onFileLoad }: {
    onFileLoad: (
      upload: {
        pdfBytes: ArrayBuffer;
        fileName: string;
        sourceType: "pdf" | "image";
        skipAcroFormDetection: boolean;
      },
      options?: { requestFieldSuggestions: true; documentRevision: string },
    ) => void | Promise<void>;
  }) => {
    const normalBytes = Uint8Array.from([7, 7, 7]).buffer;
    const fillableBytes = Uint8Array.from([8, 8, 8]).buffer;
    return (
      <div>
        <button
          type="button"
          onClick={() => onFileLoad({
            pdfBytes: normalBytes,
            fileName: "replacement.pdf",
            sourceType: "pdf",
            skipAcroFormDetection: false,
          })}
        >
          Mock normal upload
        </button>
        <button
          type="button"
          onClick={async () => {
            const { createDocumentRevision: revisionFor } = jest.requireActual("@/lib/field-suggestions") as typeof import("@/lib/field-suggestions");
            await onFileLoad(
              {
                pdfBytes: fillableBytes,
                fileName: "fillable-photo.pdf",
                sourceType: "image",
                skipAcroFormDetection: true,
              },
              {
                requestFieldSuggestions: true,
                documentRevision: await revisionFor(fillableBytes),
              },
            );
          }}
        >
          Mock fillable upload
        </button>
        <button
          type="button"
          onClick={() => onFileLoad(
            {
              pdfBytes: fillableBytes,
              fileName: "stale-photo.pdf",
              sourceType: "image",
              skipAcroFormDetection: true,
            },
            {
              requestFieldSuggestions: true,
              documentRevision: `qf-document-v1-${"f".repeat(64)}`,
            },
          )}
        >
          Mock stale fillable upload
        </button>
      </div>
    );
  },
}));

jest.mock("@/components/MobileFiller", () => ({
  MobileFiller: () => null,
}));

jest.mock("@/components/Toolbar", () => ({
  Toolbar: ({
    onUndo,
    canUndo,
    onStartOver,
  }: {
    onUndo: () => void;
    canUndo: boolean;
    onStartOver: () => void;
  }) => (
    <div>
      <button type="button" onClick={onUndo} disabled={!canUndo}>Mock undo</button>
      <button type="button" onClick={onStartOver}>Mock start over</button>
    </div>
  ),
}));

jest.mock("@/components/PdfViewer", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const canvas = {
    width: 1200,
    height: 1600,
    getContext: () => ({
      getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
    }),
  } as unknown as HTMLCanvasElement;

  return {
    PdfViewer: React.forwardRef(function MockPdfViewer(
      props: { fields: EditorField[]; onTotalPagesChange: (count: number) => void },
      ref: React.Ref<unknown>,
    ) {
      const { fields, onTotalPagesChange } = props;
      React.useEffect(() => onTotalPagesChange(1), [onTotalPagesChange]);
      React.useImperativeHandle(ref, () => ({
        getCanvasDataURL: () => "data:image/png;base64,base",
        getCanvasDimensions: () => ({ width: 1200, height: 1600 }),
        getCanvas: () => canvas,
        getViewportDims: () => ({ width: 600, height: 800 }),
        editField: jest.fn(),
        getCompositePreviewURL: mockGetCompositePreviewURL,
        refit: jest.fn(),
      }));
      return (
        <div
          data-testid="pdf-viewer"
          data-fields={JSON.stringify(fields)}
          data-field-count={fields.length}
        />
      );
    }),
  };
});

jest.mock("@/components/ContextPanel", () => ({ ContextPanel: () => null }));
jest.mock("@/components/SignatureModal", () => ({ SignatureModal: () => null }));
jest.mock("@/components/WelcomeModal", () => ({ WelcomeModal: () => null }));
jest.mock("@/components/TourModal", () => ({ TourModal: () => null }));
jest.mock("@/components/SupportForm", () => ({ SupportForm: () => null }));
jest.mock("@/components/DownloadPreviewGate", () => ({ DownloadPreviewGate: () => null }));
jest.mock("@/components/PhotoCleanupModal", () => ({ PhotoCleanupModal: () => null }));

jest.mock("@/lib/persistence", () => ({
  savePdfToIndexedDB: jest.fn().mockResolvedValue(undefined),
  loadPdfFromIndexedDB: jest.fn().mockResolvedValue(null),
  saveFieldsToLocalStorage: jest.fn(),
  loadFieldsFromLocalStorage: jest.fn(() => []),
  savePageToLocalStorage: jest.fn(),
  loadPageFromLocalStorage: jest.fn(() => 0),
  saveFileNameToLocalStorage: jest.fn(),
  loadFileNameFromLocalStorage: jest.fn(() => "photo.pdf"),
  clearEditorState: jest.fn().mockResolvedValue(undefined),
  saveZoomToLocalStorage: jest.fn(),
  loadZoomFromLocalStorage: jest.fn(() => 100),
  cleanupOldIndexedDBSessions: jest.fn(),
}));

jest.mock("@/lib/pdf-utils", () => ({
  detectAcroFormFields: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("@/lib/meta-pixel", () => ({ trackMetaEvent: jest.fn() }));
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
        getPage: async () => ({ getViewport: () => ({ width: 600, height: 800 }) }),
      }),
    }),
  }),
}));

jest.mock("@/lib/field-suggestion-rollout", () => {
  const actual = jest.requireActual("@/lib/field-suggestion-rollout");
  return {
    ...actual,
    isFieldSuggestionReviewEnabled: jest.fn(() => true),
  };
});

jest.mock("@/lib/local-field-suggestion-provider", () => ({
  detectLocalFieldSuggestions: jest.fn(),
}));

const mockedLoadPdf = loadPdfFromIndexedDB as jest.MockedFunction<typeof loadPdfFromIndexedDB>;
const mockedSaveFields = saveFieldsToLocalStorage as jest.MockedFunction<typeof saveFieldsToLocalStorage>;
const mockedRolloutEnabled = isFieldSuggestionReviewEnabled as jest.MockedFunction<typeof isFieldSuggestionReviewEnabled>;
const mockedDetectLocal = detectLocalFieldSuggestions as jest.MockedFunction<typeof detectLocalFieldSuggestions>;

function suggestedFields(documentRevision: string): FieldSuggestion[] {
  const textBounds = { x: 80, y: 120, width: 180, height: 24 };
  const checkboxBounds = { x: 300, y: 120, width: 18, height: 18 };
  return [
    {
      schemaVersion: 1,
      id: createFieldSuggestionId({ documentRevision, pageIndex: 0, boundingBox: textBounds }),
      documentRevision,
      type: "text",
      pageIndex: 0,
      boundingBox: textBounds,
      coordinateSpace: { unit: "pdf-point", origin: "top-left", pageWidth: 600, pageHeight: 800 },
      confidence: 0.58,
      metadata: { category: "visual-box" },
    },
    {
      schemaVersion: 1,
      id: createFieldSuggestionId({ documentRevision, pageIndex: 0, boundingBox: checkboxBounds }),
      documentRevision,
      type: "checkbox",
      pageIndex: 0,
      boundingBox: checkboxBounds,
      coordinateSpace: { unit: "pdf-point", origin: "top-left", pageWidth: 600, pageHeight: 800 },
      confidence: 0.72,
      metadata: { category: "visual-box" },
    },
  ];
}

function editorFields(): EditorField[] {
  const value = screen.getByTestId("pdf-viewer").getAttribute("data-fields") ?? "[]";
  return JSON.parse(value) as EditorField[];
}

async function renderPhotoSession(options: {
  photoSession?: boolean;
  intentRevision?: string;
  pageIndex?: number;
  detector?: (revision: string) => FieldSuggestion[];
} = {}) {
  const bytes = Uint8Array.from([1, 2, 3, 4]).buffer;
  const documentRevision = await createDocumentRevision(bytes);
  mockedLoadPdf.mockResolvedValue(bytes);
  if (options.photoSession !== false) sessionStorage.setItem("qf-photo-capture-source", "1");

  const intentRevision = options.intentRevision ?? documentRevision;
  if (options.pageIndex === undefined || options.pageIndex === 0) {
    storeFieldSuggestionIntent(intentRevision);
  } else {
    sessionStorage.setItem(FIELD_SUGGESTION_INTENT_KEY, JSON.stringify({
      version: 1,
      documentRevision: intentRevision,
      pageIndex: options.pageIndex,
    }));
  }
  mockedDetectLocal.mockImplementation(() => (options.detector ?? suggestedFields)(documentRevision));
  render(<EditorPage />);
  return { bytes, documentRevision };
}

describe("editor local field suggestion review", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("qf_welcome_dismissed", "1");
    localStorage.setItem("quickfill_welcomed", "1");
    localStorage.setItem("quickfill_tour_done", "1");
    mockedLoadPdf.mockResolvedValue(null);
    mockedRolloutEnabled.mockReturnValue(true);
    mockedDetectLocal.mockReset();
    mockedDetectLocal.mockImplementation((request) => suggestedFields(request.documentRevision));
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("keeps the existing photo entry and add-page prompt unchanged when disabled", async () => {
    mockedRolloutEnabled.mockReturnValue(false);
    const bytes = Uint8Array.from([1, 2, 3]).buffer;
    mockedLoadPdf.mockResolvedValue(bytes);
    sessionStorage.setItem("qf-photo-capture-source", "1");
    storeFieldSuggestionIntent(await createDocumentRevision(bytes));

    render(<EditorPage />);

    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();
    expect(mockedDetectLocal).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();
  });

  it("keeps suggestions out of fields, persistence, preview, export, and the API before acceptance", async () => {
    await renderPhotoSession();

    expect(await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 })).toBeInTheDocument();
    expect(editorFields()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Add another page" })).not.toBeInTheDocument();
    await waitFor(() => expect(mockedSaveFields).toHaveBeenCalled());
    expect(mockedSaveFields.mock.calls.every(([saved]) => saved.length === 0)).toBe(true);
    expect(mockGetCompositePreviewURL).not.toHaveBeenCalled();

    const requestUrls = (global.fetch as jest.Mock).mock.calls.map(([input]) => String(input));
    expect(requestUrls.some((url) => url.includes("/api/detect-fields"))).toBe(false);
    expect(requestUrls.some((url) => url.includes("/api/fill-pdf"))).toBe(false);
    expect(sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();
  });

  it("accepts all as one history checkpoint and one Undo removes the batch", async () => {
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));

    await waitFor(() => expect(editorFields()).toHaveLength(2));
    const accepted = editorFields();
    expect(accepted.find((field) => field.type === "text")).toMatchObject({ value: "", page: 0 });
    expect(accepted.find((field) => field.type === "checkbox")).toMatchObject({ checked: false, page: 0 });
    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    const undoButtons = screen.getAllByRole("button", { name: "Mock undo" });
    expect(undoButtons[0]).toBeEnabled();
    fireEvent.click(undoButtons[0]);

    await waitFor(() => expect(editorFields()).toEqual([]));
    expect(screen.getAllByRole("button", { name: "Mock undo" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
  });

  it("supports individual accept, reject, and text-to-checkbox changes transactionally", async () => {
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 });

    fireEvent.change(screen.getAllByRole("combobox", { name: "Field type" })[0], { target: { value: "checkbox" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept field 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject field 2" }));
    expect(editorFields()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Add accepted fields (1)" }));

    await waitFor(() => expect(editorFields()).toHaveLength(1));
    expect(editorFields()[0]).toMatchObject({ type: "checkbox", checked: false, page: 0 });
  });

  it("cancels without accepting fields and then shows the add-page prompt", async () => {
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Accept field 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue in editor" }));

    expect(editorFields()).toEqual([]);
    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
  });

  it("retries by replacing the same stable IDs instead of duplicating them", async () => {
    const { documentRevision } = await renderPhotoSession();
    await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 });
    const ids = suggestedFields(documentRevision).map((suggestion) => suggestion.id);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(mockedDetectLocal).toHaveBeenCalledTimes(2));
    await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 });
    for (const id of ids) expect(screen.getAllByTestId(`field-suggestion-${id}`)).toHaveLength(1);
    expect(editorFields()).toEqual([]);
  });

  it("falls back to the normal editor with zero fields when the local detector fails", async () => {
    await renderPhotoSession({ detector: () => { throw new Error("local detector failed"); } });

    expect(await screen.findByRole("heading", { name: "Couldn’t suggest fields" }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Field suggestions are unavailable");
    expect(editorFields()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Continue in editor" }));
    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
  });

  it("rejects a stale-document intent", async () => {
    const staleRevision = `qf-document-v1-${"b".repeat(64)}`;
    await renderPhotoSession({ intentRevision: staleRevision });
    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
    expect(mockedDetectLocal).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();
  });

  it("rejects a non-first-page intent", async () => {
    await renderPhotoSession({ pageIndex: 1 });
    expect(await screen.findByRole("button", { name: "Add another page" })).toBeInTheDocument();
    expect(mockedDetectLocal).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();
  });

  it("rejects an intent that did not come from a photo session", async () => {
    await renderPhotoSession({ photoSession: false });
    await screen.findByTestId("pdf-viewer");
    expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add another page" })).not.toBeInTheDocument();
    expect(mockedDetectLocal).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FIELD_SUGGESTION_INTENT_KEY)).toBeNull();
  });

  it("clears review state on Start Over and a normal replacement stays normal", async () => {
    await renderPhotoSession();
    await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 });

    fireEvent.click(screen.getAllByRole("button", { name: "Mock start over" })[0]);
    expect(await screen.findByRole("button", { name: "Mock normal upload" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mock normal upload" }));
    await screen.findByTestId("pdf-viewer");
    expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();
  });

  it("accepts a direct cleaned-photo request only when its revision matches", async () => {
    render(<EditorPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Mock fillable upload" }));
    expect(await screen.findByRole("heading", { name: "Review fillable field suggestions" }, { timeout: 3000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue in editor" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Mock start over" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Mock stale fillable upload" }));
    await screen.findByTestId("pdf-viewer");
    expect(screen.queryByRole("heading", { name: "Review fillable field suggestions" })).not.toBeInTheDocument();
  });
});
