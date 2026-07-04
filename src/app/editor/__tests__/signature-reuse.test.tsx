import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import EditorPage from "../page";
import type { EditorField, ToolType } from "@/lib/types";

const LOCAL_KEY = "quickfill_signature";
const LOCAL_SIGNATURE = "data:image/png;base64,bG9jYWxTaWdMb2NhbA==";
const ACCOUNT_SIGNATURE = "data:image/png;base64,YWNjb3VudFNpZw==";
const DRAWN_SIGNATURE = "data:image/png;base64,ZHJhd25TaWc=";

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
  UploadZone: ({ onFileLoad }: { onFileLoad: (upload: { pdfBytes: ArrayBuffer; fileName: string }) => void }) => (
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
  Toolbar: ({ activeTool }: { activeTool: ToolType }) => (
    <div data-testid="active-tool">{activeTool}</div>
  ),
}));

let placedSignatureCount = 0;

jest.mock("@/components/PdfViewer", () => {
  const React = jest.requireActual("react");
  return {
    PdfViewer: React.forwardRef(function MockPdfViewer(
      props: {
        fields: EditorField[];
        onFieldAdd: (field: EditorField) => void;
        onSignatureFieldPlaced?: (field: EditorField) => void;
        onSignatureRequest?: (fieldId: string) => void;
      },
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

      const placeSignature = () => {
        placedSignatureCount += 1;
        const field: EditorField = {
          id: `sig-${placedSignatureCount}`,
          type: "signature",
          x: 10,
          y: 10,
          width: 160,
          height: 60,
          page: 0,
          value: "",
          fontSize: 16,
        };
        // Mirrors the real viewer: add the field, then notify placement.
        props.onFieldAdd(field);
        props.onSignatureFieldPlaced?.(field);
      };

      return (
        <div data-testid="pdf-viewer">
          <div data-testid="fields-json">
            {JSON.stringify(
              props.fields.map((f) => ({
                id: f.id,
                type: f.type,
                signatureDataUrl: (f as { signatureDataUrl?: string }).signatureDataUrl ?? null,
              }))
            )}
          </div>
          <button type="button" onClick={placeSignature}>
            Mock place signature
          </button>
          <button
            type="button"
            onClick={() => props.onSignatureRequest?.(props.fields[0]?.id ?? "")}
          >
            Mock request signature
          </button>
        </div>
      );
    }),
  };
});

jest.mock("@/components/ContextPanel", () => ({
  ContextPanel: () => null,
}));

jest.mock("@/components/SignatureModal", () => ({
  SignatureModal: ({
    open,
    onSave,
    onDelete,
    onUseExisting,
    existingSignature,
    signatureSource,
  }: {
    open: boolean;
    onSave: (dataUrl: string) => void;
    onDelete?: () => void;
    onUseExisting?: () => void;
    existingSignature?: string | null;
    signatureSource?: string | null;
  }) => {
    if (!open) return null;
    return (
      <div data-testid="signature-modal">
        <div data-testid="modal-existing">{existingSignature ?? "none"}</div>
        <div data-testid="modal-source">{signatureSource ?? "none"}</div>
        <button type="button" onClick={() => onSave(DRAWN_SIGNATURE)}>
          Mock sig save
        </button>
        {onDelete && (
          <button type="button" onClick={() => onDelete()}>
            Mock sig delete
          </button>
        )}
        {onUseExisting && (
          <button type="button" onClick={() => onUseExisting()}>
            Mock sig use
          </button>
        )}
      </div>
    );
  },
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
  PhotoCleanupModal: () => null,
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

type SignatureApiOptions = {
  getSignature?: string | null;
  authed?: boolean;
};

function mockSignatureApi({ getSignature = null, authed = false }: SignatureApiOptions = {}) {
  return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/signature") {
      const method = init?.method ?? "GET";
      if (!authed) {
        return { ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) } as Response;
      }
      if (method === "GET") {
        return { ok: true, status: 200, json: async () => ({ signatureDataUrl: getSignature }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

async function loadEditorWithPdf() {
  render(<EditorPage />);
  fireEvent.click(screen.getByRole("button", { name: "Mock upload" }));
  await screen.findByTestId("pdf-viewer");
  // Flush the mount-time /api/signature fetch chain
  await act(async () => {});
}

function fieldsJson(): { id: string; type: string; signatureDataUrl: string | null }[] {
  return JSON.parse(screen.getByTestId("fields-json").textContent ?? "[]");
}

function signatureApiCalls(method: string): number {
  return (global.fetch as jest.Mock).mock.calls.filter(
    ([url, init]: [RequestInfo, RequestInit | undefined]) =>
      String(url) === "/api/signature" && (init?.method ?? "GET") === method
  ).length;
}

describe("Signature reuse", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    placedSignatureCount = 0;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("anonymous 401 falls back to the signature saved on this device", async () => {
    localStorage.setItem(LOCAL_KEY, LOCAL_SIGNATURE);
    global.fetch = mockSignatureApi({ authed: false });

    await loadEditorWithPdf();
    fireEvent.click(screen.getByRole("button", { name: "Mock place signature" }));

    const fields = fieldsJson();
    expect(fields).toHaveLength(1);
    expect(fields[0].signatureDataUrl).toBe(LOCAL_SIGNATURE);
    // Auto-applied, no modal needed
    expect(screen.queryByTestId("signature-modal")).not.toBeInTheDocument();
  });

  it("account signature wins over the local one when signed in", async () => {
    localStorage.setItem(LOCAL_KEY, LOCAL_SIGNATURE);
    global.fetch = mockSignatureApi({ authed: true, getSignature: ACCOUNT_SIGNATURE });

    await loadEditorWithPdf();
    fireEvent.click(screen.getByRole("button", { name: "Mock place signature" }));

    expect(fieldsJson()[0].signatureDataUrl).toBe(ACCOUNT_SIGNATURE);
  });

  it("ignores a corrupt local value and opens the modal instead", async () => {
    localStorage.setItem(LOCAL_KEY, "not-a-png-data-url");
    global.fetch = mockSignatureApi({ authed: false });

    await loadEditorWithPdf();
    fireEvent.click(screen.getByRole("button", { name: "Mock place signature" }));

    expect(await screen.findByTestId("signature-modal")).toBeInTheDocument();
    expect(fieldsJson()[0].signatureDataUrl).toBeNull();
  });

  it("saving a drawn signature writes the local store and applies it", async () => {
    global.fetch = mockSignatureApi({ authed: false });

    await loadEditorWithPdf();
    fireEvent.click(screen.getByRole("button", { name: "Mock place signature" }));

    // No saved signature: modal opens for drawing
    expect(await screen.findByTestId("signature-modal")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mock sig save" }));
    });

    expect(localStorage.getItem(LOCAL_KEY)).toBe(DRAWN_SIGNATURE);
    expect(fieldsJson()[0].signatureDataUrl).toBe(DRAWN_SIGNATURE);
    expect(screen.queryByTestId("signature-modal")).not.toBeInTheDocument();
  });

  it("reuses the saved signature for later placements without redrawing", async () => {
    global.fetch = mockSignatureApi({ authed: false });

    await loadEditorWithPdf();
    fireEvent.click(screen.getByRole("button", { name: "Mock place signature" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mock sig save" }));
    });

    // Second and third placements auto-apply, no modal
    fireEvent.click(screen.getByRole("button", { name: "Mock place signature" }));
    fireEvent.click(screen.getByRole("button", { name: "Mock place signature" }));

    const fields = fieldsJson();
    expect(fields).toHaveLength(3);
    expect(fields.every((f) => f.signatureDataUrl === DRAWN_SIGNATURE)).toBe(true);
    expect(screen.queryByTestId("signature-modal")).not.toBeInTheDocument();
  });

  it("delete clears the local store and state even when the API rejects with 401", async () => {
    global.fetch = mockSignatureApi({ authed: false });

    await loadEditorWithPdf();
    fireEvent.click(screen.getByRole("button", { name: "Mock place signature" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mock sig save" }));
    });
    expect(localStorage.getItem(LOCAL_KEY)).toBe(DRAWN_SIGNATURE);

    // Re-open the modal on the placed field and delete the saved signature
    fireEvent.click(screen.getByRole("button", { name: "Mock request signature" }));
    expect(await screen.findByTestId("signature-modal")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mock sig delete" }));
    });

    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    expect(signatureApiCalls("DELETE")).toBe(1);
    expect(screen.queryByTestId("signature-modal")).not.toBeInTheDocument();

    // Saved signature is gone: the next placement opens the modal again
    fireEvent.click(screen.getByRole("button", { name: "Mock place signature" }));
    expect(await screen.findByTestId("signature-modal")).toBeInTheDocument();
  });

  it("still POSTs to the account API on save (existing behaviour preserved)", async () => {
    global.fetch = mockSignatureApi({ authed: true, getSignature: null });

    await loadEditorWithPdf();
    fireEvent.click(screen.getByRole("button", { name: "Mock place signature" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mock sig save" }));
    });

    expect(signatureApiCalls("POST")).toBe(1);
    expect(localStorage.getItem(LOCAL_KEY)).toBe(DRAWN_SIGNATURE);
  });
});
