import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MobileFiller } from "@/components/MobileFiller";
import { normalizeDocumentUpload } from "@/lib/document-intake";
import { savePdfToIndexedDB } from "@/lib/persistence";
import { detectAcroFormFields } from "@/lib/pdf-utils";
import { trackEvent } from "@/lib/analytics";
import {
  isFieldSuggestionReviewEnabled,
  storeFieldSuggestionIntent,
} from "@/lib/field-suggestion-rollout";

const LOCAL_SIGNATURE = "data:image/png;base64,bG9jYWxTaWdMb2NhbA==";
const ACCOUNT_SIGNATURE = "data:image/png;base64,YWNjb3VudFNpZw==";
const SECOND_ACCOUNT_SIGNATURE = "data:image/png;base64,c2Vjb25kQWNjb3VudFNpZw==";
const DRAWN_SIGNATURE = "data:image/png;base64,ZHJhd25TaWc=";

const mockAuthState: {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | null;
  sessionId: string | null;
} = {
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  sessionId: null,
};

jest.mock("@clerk/nextjs", () => ({
  useAuth: () => mockAuthState,
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
          Mock mobile sig save
        </button>
        {onDelete && (
          <button type="button" onClick={() => onDelete()}>
            Mock mobile sig delete
          </button>
        )}
        {onUseExisting && (
          <button type="button" onClick={() => onUseExisting()}>
            Mock mobile sig use
          </button>
        )}
      </div>
    );
  },
}));

jest.mock("@/components/PhotoCleanupModal", () => ({
  PhotoCleanupModal: ({
    file,
    onConfirm,
    makeFillableEnabled,
    onMakeFillable,
    onCancel,
  }: {
    file: File;
    onConfirm: (cleaned: File) => void;
    makeFillableEnabled?: boolean;
    onMakeFillable?: (cleaned: File) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="photo-cleanup-modal">
      <button type="button" onClick={() => onConfirm(new File([new Uint8Array([7])], `cleaned-${file.name}`, { type: "image/jpeg" }))}>
        Mock use photo
      </button>
      {makeFillableEnabled && onMakeFillable && (
        <button type="button" onClick={() => onMakeFillable(new File([new Uint8Array([8])], `fillable-${file.name}`, { type: "image/jpeg" }))}>
          Mock make fillable
        </button>
      )}
      <button type="button" onClick={onCancel}>Mock cancel</button>
    </div>
  ),
}));

jest.mock("@/lib/persistence", () => ({
  clearEditorState: jest.fn().mockResolvedValue(undefined),
  saveFieldsToLocalStorage: jest.fn(),
  saveFileNameToLocalStorage: jest.fn(),
  savePageToLocalStorage: jest.fn(),
  savePdfToIndexedDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/pdf-utils", () => ({
  detectAcroFormFields: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/document-intake", () => {
  const actual = jest.requireActual("@/lib/document-intake");
  return {
    ...actual,
    normalizeDocumentUpload: jest.fn(),
  };
});

jest.mock("@/lib/field-suggestions", () => ({
  createDocumentRevision: jest.fn().mockResolvedValue(`qf-document-v1-${"a".repeat(64)}`),
}));

jest.mock("@/lib/field-suggestion-rollout", () => ({
  clearFieldSuggestionIntent: jest.fn(),
  isFieldSuggestionReviewEnabled: jest.fn(() => false),
  storeFieldSuggestionIntent: jest.fn(),
}));

jest.mock("@/lib/autofill-shadow-reporting", () => ({
  trackAutofillShadowReport: jest.fn(),
}));

jest.mock("@/lib/analytics", () => ({
  trackEvent: jest.fn(),
}));

jest.mock("@/lib/pdfjs-client", () => ({
  loadPdfjsClient: jest.fn().mockRejectedValue(new Error("pdfjs disabled in tests")),
}));

jest.mock("@/lib/profile-autofill", () => ({
  autofillModeFromFlag: jest.fn(() => "off"),
  runProfileAutofill: jest.fn(),
}));

const mockedNormalize = normalizeDocumentUpload as jest.MockedFunction<typeof normalizeDocumentUpload>;
const mockedSavePdf = savePdfToIndexedDB as jest.MockedFunction<typeof savePdfToIndexedDB>;
const mockedDetect = detectAcroFormFields as jest.MockedFunction<typeof detectAcroFormFields>;
const mockedRolloutEnabled = isFieldSuggestionReviewEnabled as jest.MockedFunction<typeof isFieldSuggestionReviewEnabled>;
const mockedStoreIntent = storeFieldSuggestionIntent as jest.MockedFunction<typeof storeFieldSuggestionIntent>;

function pickUploadFile(file: File) {
  const input = document.querySelector('input[accept*="application/pdf"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

function signatureApiCalls(method: string): number {
  return (global.fetch as jest.Mock).mock.calls.filter(
    ([input, init]: [RequestInfo | URL, RequestInit | undefined]) =>
      String(input) === "/api/signature" && (init?.method ?? "GET") === method
  ).length;
}

async function uploadSignaturePdf() {
  mockedNormalize.mockResolvedValueOnce({
    fileName: "signature-form.pdf",
    pdfBytes: new ArrayBuffer(8),
    sourceType: "pdf",
    skipAcroFormDetection: false,
  });
  mockedDetect.mockResolvedValueOnce([
    { name: "signature", type: "text", x: 10, y: 10, width: 120, height: 40, page: 0, value: "" },
  ]);
  pickUploadFile(new File([new Uint8Array([1])], "signature-form.pdf", { type: "application/pdf" }));
  return screen.findByRole("button", { name: "Tap to sign" });
}

async function renderMobileSignatureField() {
  const view = render(<MobileFiller />);
  const signatureButton = await uploadSignaturePdf();
  return { ...view, signatureButton };
}

beforeEach(() => {
  mockAuthState.isLoaded = true;
  mockAuthState.isSignedIn = false;
  mockAuthState.userId = null;
  mockAuthState.sessionId = null;
  localStorage.clear();
});

describe("MobileFiller photo cleanup wiring", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockedRolloutEnabled.mockReturnValue(false);
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
    mockedNormalize.mockResolvedValue({
      fileName: "cleaned.pdf",
      pdfBytes: new ArrayBuffer(8),
      sourceType: "image",
      skipAcroFormDetection: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("shows a mobile Take photo input with rear camera capture", () => {
    render(<MobileFiller />);

    const input = screen.getByLabelText("Take photo");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png");
    expect(input).toHaveAttribute("capture", "environment");
    expect(screen.getByRole("button", { name: "Take photo" })).toHaveClass("sm:hidden");
  });

  it("opens cleanup for cleanable photos and proceeds with the cleaned file", async () => {
    render(<MobileFiller />);

    pickUploadFile(new File([new Uint8Array([1])], "photo.png", { type: "image/png" }));

    expect(await screen.findByTestId("photo-cleanup-modal")).toBeInTheDocument();
    expect(mockedNormalize).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mock use photo" }));

    await waitFor(() => {
      expect(mockedNormalize).toHaveBeenCalledTimes(1);
    });
    expect((mockedNormalize.mock.calls[0][0] as File).name).toBe("cleaned-photo.png");
    await waitFor(() => {
      expect(mockedSavePdf).toHaveBeenCalled();
    });
    expect(sessionStorage.getItem("qf-photo-capture-source")).toBe("1");
    expect(mockedStoreIntent).not.toHaveBeenCalled();
  });

  it("keeps Make this fillable hidden when the rollout is disabled", async () => {
    render(<MobileFiller />);
    pickUploadFile(new File([new Uint8Array([1])], "photo.png", { type: "image/png" }));

    expect(await screen.findByTestId("photo-cleanup-modal")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mock make fillable" })).not.toBeInTheDocument();
  });

  it("stores a revision-only intent for the gated mobile local action", async () => {
    mockedRolloutEnabled.mockReturnValue(true);
    render(<MobileFiller />);
    pickUploadFile(new File([new Uint8Array([1])], "photo.png", { type: "image/png" }));

    fireEvent.click(await screen.findByRole("button", { name: "Mock make fillable" }));

    await waitFor(() => expect(mockedStoreIntent).toHaveBeenCalledWith(`qf-document-v1-${"a".repeat(64)}`));
  });

  it("cancel aborts a cleanable photo without processing", async () => {
    render(<MobileFiller />);

    pickUploadFile(new File([new Uint8Array([1])], "photo.jpg", { type: "image/jpeg" }));

    expect(await screen.findByTestId("photo-cleanup-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mock cancel" }));

    await waitFor(() => {
      expect(screen.queryByTestId("photo-cleanup-modal")).not.toBeInTheDocument();
    });
    expect(mockedNormalize).not.toHaveBeenCalled();
    expect(mockedSavePdf).not.toHaveBeenCalled();
  });

  it("processes PDF uploads without showing cleanup", async () => {
    mockedNormalize.mockResolvedValueOnce({
      fileName: "form.pdf",
      pdfBytes: new ArrayBuffer(8),
      sourceType: "pdf",
      skipAcroFormDetection: false,
    });

    render(<MobileFiller />);

    pickUploadFile(new File([new Uint8Array([1])], "form.pdf", { type: "application/pdf" }));

    await waitFor(() => {
      expect(mockedNormalize).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("photo-cleanup-modal")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("qf-photo-capture-source")).toBeNull();
  });
});

describe("MobileFiller signature loading", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockedRolloutEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("does not request an account signature while auth is unresolved", async () => {
    mockAuthState.isLoaded = false;
    mockAuthState.isSignedIn = undefined;
    mockAuthState.userId = null;
    mockAuthState.sessionId = null;
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));

    render(<MobileFiller />);
    await act(async () => {});

    expect(signatureApiCalls("GET")).toBe(0);
  });

  it("does not request an account signature for a resolved anonymous user", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));

    render(<MobileFiller />);
    await act(async () => {});

    expect(signatureApiCalls("GET")).toBe(0);
  });

  it("keeps the anonymous device-local signature available", async () => {
    localStorage.setItem("quickfill_signature", LOCAL_SIGNATURE);
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));

    const { signatureButton } = await renderMobileSignatureField();
    fireEvent.click(signatureButton);

    expect(await screen.findByTestId("signature-modal")).toBeInTheDocument();
    expect(screen.getByTestId("modal-existing")).toHaveTextContent(LOCAL_SIGNATURE);
    expect(screen.getByTestId("modal-source")).toHaveTextContent("device");
    fireEvent.click(screen.getByRole("button", { name: "Mock mobile sig use" }));

    expect(await screen.findByAltText("Signature")).toHaveAttribute("src", LOCAL_SIGNATURE);
    expect(signatureApiCalls("GET")).toBe(0);
  });

  it("loads the signed-in account signature exactly once", async () => {
    mockAuthState.isSignedIn = true;
    mockAuthState.userId = "user_mobile_signature";
    mockAuthState.sessionId = "session_mobile_signature";
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/signature" && (init?.method ?? "GET") === "GET") {
        return { ok: true, json: async () => ({ signatureDataUrl: ACCOUNT_SIGNATURE }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const { signatureButton } = await renderMobileSignatureField();
    await waitFor(() => expect(signatureApiCalls("GET")).toBe(1));
    fireEvent.click(signatureButton);

    await waitFor(() => expect(screen.getByTestId("modal-existing")).toHaveTextContent(ACCOUNT_SIGNATURE));
    expect(screen.getByTestId("modal-source")).toHaveTextContent("account");
    expect(signatureApiCalls("GET")).toBe(1);
  });

  it("does not duplicate the account request when the same authenticated session rerenders", async () => {
    mockAuthState.isSignedIn = true;
    mockAuthState.userId = "user_mobile_signature";
    mockAuthState.sessionId = "session_mobile_signature";
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));

    const { rerender } = render(<MobileFiller />);
    await waitFor(() => expect(signatureApiCalls("GET")).toBe(1));

    rerender(<MobileFiller />);
    await act(async () => {});

    expect(signatureApiCalls("GET")).toBe(1);
  });

  it("does not duplicate the account request when auth is temporarily unresolved and returns to the same session", async () => {
    mockAuthState.isSignedIn = true;
    mockAuthState.userId = "user_mobile_signature";
    mockAuthState.sessionId = "session_mobile_signature";
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));

    const { rerender } = render(<MobileFiller />);
    await waitFor(() => expect(signatureApiCalls("GET")).toBe(1));

    mockAuthState.isLoaded = false;
    mockAuthState.isSignedIn = undefined;
    mockAuthState.userId = null;
    mockAuthState.sessionId = null;
    rerender(<MobileFiller />);
    await act(async () => {});

    mockAuthState.isLoaded = true;
    mockAuthState.isSignedIn = true;
    mockAuthState.userId = "user_mobile_signature";
    mockAuthState.sessionId = "session_mobile_signature";
    rerender(<MobileFiller />);
    await act(async () => {});

    expect(signatureApiCalls("GET")).toBe(1);
  });

  it("loads again after resolved sign-out and a new session for the same user", async () => {
    mockAuthState.isSignedIn = true;
    mockAuthState.userId = "user_mobile_signature";
    mockAuthState.sessionId = "session_mobile_signature";
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));

    const { rerender } = render(<MobileFiller />);
    await waitFor(() => expect(signatureApiCalls("GET")).toBe(1));

    mockAuthState.isSignedIn = false;
    mockAuthState.userId = null;
    mockAuthState.sessionId = null;
    rerender(<MobileFiller />);
    await act(async () => {});

    mockAuthState.isSignedIn = true;
    mockAuthState.userId = "user_mobile_signature";
    mockAuthState.sessionId = "session_mobile_signature_new";
    rerender(<MobileFiller />);
    await waitFor(() => expect(signatureApiCalls("GET")).toBe(2));
  });

  it("rejects a late response from an old session for the same user", async () => {
    const accountLoadResolvers: Array<(response: Response) => void> = [];
    mockAuthState.isSignedIn = true;
    mockAuthState.userId = "user_mobile_signature";
    mockAuthState.sessionId = "session_mobile_signature";
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (String(input) === "/api/signature" && (init?.method ?? "GET") === "GET") {
        return new Promise((resolve) => accountLoadResolvers.push(resolve));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    const { rerender } = render(<MobileFiller />);
    await waitFor(() => expect(accountLoadResolvers).toHaveLength(1));

    mockAuthState.sessionId = "session_mobile_signature_new";
    rerender(<MobileFiller />);
    await waitFor(() => expect(accountLoadResolvers).toHaveLength(2));

    await act(async () => {
      accountLoadResolvers[1]({
        ok: true,
        json: async () => ({ signatureDataUrl: SECOND_ACCOUNT_SIGNATURE }),
      } as Response);
    });
    await act(async () => {
      accountLoadResolvers[0]({
        ok: true,
        json: async () => ({ signatureDataUrl: ACCOUNT_SIGNATURE }),
      } as Response);
    });

    const signatureButton = await uploadSignaturePdf();
    fireEvent.click(signatureButton);

    expect(await screen.findByTestId("modal-existing")).toHaveTextContent(SECOND_ACCOUNT_SIGNATURE);
    expect(signatureApiCalls("GET")).toBe(2);
  });

  it("ignores a stale response after the signed-in user changes", async () => {
    const accountLoadResolvers: Array<(response: Response) => void> = [];
    mockAuthState.isSignedIn = true;
    mockAuthState.userId = "user_mobile_first";
    mockAuthState.sessionId = "session_mobile_first";
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (String(input) === "/api/signature" && (init?.method ?? "GET") === "GET") {
        return new Promise((resolve) => accountLoadResolvers.push(resolve));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    const { rerender } = render(<MobileFiller />);
    await waitFor(() => expect(accountLoadResolvers).toHaveLength(1));

    mockAuthState.userId = "user_mobile_second";
    mockAuthState.sessionId = "session_mobile_second";
    rerender(<MobileFiller />);
    await waitFor(() => expect(accountLoadResolvers).toHaveLength(2));

    await act(async () => {
      accountLoadResolvers[1]({
        ok: true,
        json: async () => ({ signatureDataUrl: SECOND_ACCOUNT_SIGNATURE }),
      } as Response);
    });
    await act(async () => {
      accountLoadResolvers[0]({
        ok: true,
        json: async () => ({ signatureDataUrl: ACCOUNT_SIGNATURE }),
      } as Response);
    });

    const signatureButton = await uploadSignaturePdf();
    fireEvent.click(signatureButton);

    expect(await screen.findByTestId("modal-existing")).toHaveTextContent(SECOND_ACCOUNT_SIGNATURE);
    expect(signatureApiCalls("GET")).toBe(2);
  });

  it("ignores a late account response after unmount", async () => {
    let resolveAccountLoad: ((response: Response) => void) | null = null;
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockAuthState.isSignedIn = true;
    mockAuthState.userId = "user_mobile_signature";
    mockAuthState.sessionId = "session_mobile_signature";
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (String(input) === "/api/signature" && (init?.method ?? "GET") === "GET") {
        return new Promise((resolve) => {
          resolveAccountLoad = resolve;
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    const { unmount } = render(<MobileFiller />);
    await waitFor(() => expect(signatureApiCalls("GET")).toBe(1));
    unmount();

    const completeAccountLoad = resolveAccountLoad;
    if (!completeAccountLoad) throw new Error("Account signature request did not start");
    await act(async () => {
      completeAccountLoad({
        ok: true,
        json: async () => ({ signatureDataUrl: ACCOUNT_SIGNATURE }),
      } as Response);
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("does not let a late account response overwrite a signature saved this session", async () => {
    let resolveAccountLoad: ((response: Response) => void) | null = null;
    mockAuthState.isSignedIn = true;
    mockAuthState.userId = "user_mobile_signature";
    mockAuthState.sessionId = "session_mobile_signature";
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (String(input) === "/api/signature" && (init?.method ?? "GET") === "GET") {
        return new Promise((resolve) => {
          resolveAccountLoad = resolve;
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    const { signatureButton } = await renderMobileSignatureField();
    fireEvent.click(signatureButton);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mock mobile sig save" }));
    });
    expect(await screen.findByAltText("Signature")).toHaveAttribute("src", DRAWN_SIGNATURE);

    const completeAccountLoad = resolveAccountLoad;
    if (!completeAccountLoad) throw new Error("Account signature request did not start");
    await act(async () => {
      completeAccountLoad({
        ok: true,
        json: async () => ({ signatureDataUrl: ACCOUNT_SIGNATURE }),
      } as Response);
    });

    fireEvent.click(screen.getByAltText("Signature").closest("button") as HTMLButtonElement);
    expect(await screen.findByTestId("modal-existing")).toHaveTextContent(DRAWN_SIGNATURE);
    expect(signatureApiCalls("GET")).toBe(1);
    expect(signatureApiCalls("POST")).toBe(1);
  });

  it("does not let a late account response restore a signature deleted this session", async () => {
    let resolveAccountLoad: ((response: Response) => void) | null = null;
    mockAuthState.isSignedIn = true;
    mockAuthState.userId = "user_mobile_signature";
    mockAuthState.sessionId = "session_mobile_signature";
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (String(input) === "/api/signature" && (init?.method ?? "GET") === "GET") {
        return new Promise((resolve) => {
          resolveAccountLoad = resolve;
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    const { signatureButton } = await renderMobileSignatureField();
    fireEvent.click(signatureButton);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mock mobile sig save" }));
    });
    fireEvent.click((await screen.findByAltText("Signature")).closest("button") as HTMLButtonElement);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mock mobile sig delete" }));
    });

    const completeAccountLoad = resolveAccountLoad;
    if (!completeAccountLoad) throw new Error("Account signature request did not start");
    await act(async () => {
      completeAccountLoad({
        ok: true,
        json: async () => ({ signatureDataUrl: ACCOUNT_SIGNATURE }),
      } as Response);
    });

    fireEvent.click(screen.getByAltText("Signature").closest("button") as HTMLButtonElement);
    expect(await screen.findByTestId("modal-existing")).toHaveTextContent("none");
    expect(localStorage.getItem("quickfill_signature")).toBeNull();
    expect(signatureApiCalls("GET")).toBe(1);
    expect(signatureApiCalls("DELETE")).toBe(1);
  });

  it("keeps the local fallback non-blocking when the signed-in request fails", async () => {
    localStorage.setItem("quickfill_signature", LOCAL_SIGNATURE);
    mockAuthState.isSignedIn = true;
    mockAuthState.userId = "user_mobile_signature";
    mockAuthState.sessionId = "session_mobile_signature";
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (String(input) === "/api/signature" && (init?.method ?? "GET") === "GET") {
        return Promise.reject(new Error("Signature request failed"));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    const { signatureButton } = await renderMobileSignatureField();
    await waitFor(() => expect(signatureApiCalls("GET")).toBe(1));
    fireEvent.click(signatureButton);

    await waitFor(() => expect(screen.getByTestId("modal-existing")).toHaveTextContent(LOCAL_SIGNATURE));
    expect(screen.getByTestId("modal-source")).toHaveTextContent("device");
    expect(screen.getByRole("button", { name: /Download PDF/i })).toBeEnabled();
  });
});

describe("MobileFiller download gate", () => {
  const originalFetch = global.fetch;
  const originalCreateObjectURL = global.URL.createObjectURL;
  const originalRevokeObjectURL = global.URL.revokeObjectURL;
  const mockedTrackEvent = trackEvent as jest.MockedFunction<typeof trackEvent>;

  const fillPdfCalls: string[] = [];

  function mockFetchWithUsage(usage: Record<string, unknown>) {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/signature")) {
        return { ok: true, json: async () => ({}) } as Response;
      }
      if (url.includes("/api/usage")) {
        return { ok: true, json: async () => usage } as Response;
      }
      if (url.includes("/api/fill-pdf")) {
        fillPdfCalls.push(url);
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => new ArrayBuffer(8),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof global.fetch;
  }

  async function uploadAcroFormPdf() {
    mockedNormalize.mockResolvedValueOnce({
      fileName: "form.pdf",
      pdfBytes: new ArrayBuffer(8),
      sourceType: "pdf",
      skipAcroFormDetection: false,
    });
    mockedDetect.mockResolvedValueOnce([
      { name: "full_name", type: "text", x: 10, y: 10, width: 120, height: 20, page: 0, value: "" },
    ]);

    render(<MobileFiller />);
    pickUploadFile(new File([new Uint8Array([1])], "form.pdf", { type: "application/pdf" }));

    return screen.findByRole("button", { name: /Download PDF/i });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    fillPdfCalls.length = 0;
    global.URL.createObjectURL = jest.fn(() => "blob:mock");
    global.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.URL.createObjectURL = originalCreateObjectURL;
    global.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("non-Pro download opens the gate and never calls fill-pdf", async () => {
    mockFetchWithUsage({ isPro: false, used: 0, limit: 3, guest: true });

    const downloadButton = await uploadAcroFormPdf();
    fireEvent.click(downloadButton);

    expect(
      await screen.findByRole("heading", { name: "Your document is ready" })
    ).toBeInTheDocument();
    expect(fillPdfCalls).toHaveLength(0);
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "download_attempt",
      expect.objectContaining({ surface: "mobile" })
    );
    expect(mockedTrackEvent).toHaveBeenCalledWith("download_gate_shown", {
      source: "mobile_filler",
    });
    // Old free-tier language is gone.
    expect(screen.queryByText(/Free limit reached/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Downloaded with QuickFill watermark/i)).not.toBeInTheDocument();
  });

  it("gate checkout links carry the mobile checkout source", async () => {
    mockFetchWithUsage({ isPro: false, used: 0, limit: 3, guest: true });

    const downloadButton = await uploadAcroFormPdf();
    fireEvent.click(downloadButton);

    await screen.findByRole("heading", { name: "Your document is ready" });
    expect(screen.getByRole("link", { name: "Unlock download for A$2" })).toHaveAttribute(
      "href",
      "/checkout?plan=pro&billing=monthly&source=download_preview_gate_mobile"
    );
    expect(screen.getByRole("link", { name: "Prefer annual? A$149/year" })).toHaveAttribute(
      "href",
      "/checkout?plan=pro&billing=annual&source=download_preview_gate_mobile"
    );
  });

  it("Keep editing closes the gate and preserves typed work", async () => {
    mockFetchWithUsage({ isPro: false, used: 0, limit: 3, guest: true });

    const downloadButton = await uploadAcroFormPdf();

    const input = screen.getByPlaceholderText("Type here");
    fireEvent.change(input, { target: { value: "Kyle" } });

    fireEvent.click(downloadButton);
    await screen.findByRole("heading", { name: "Your document is ready" });

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Your document is ready" })
      ).not.toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Type here")).toHaveValue("Kyle");
  });

  it("Pro download stays clean: fill-pdf runs, no gate, success step", async () => {
    mockFetchWithUsage({ isPro: true, tier: "pro", guest: false });

    const downloadButton = await uploadAcroFormPdf();
    fireEvent.click(downloadButton);

    expect(await screen.findByRole("heading", { name: "All done!" })).toBeInTheDocument();
    expect(fillPdfCalls).toHaveLength(1);
    expect(
      screen.queryByRole("heading", { name: "Your document is ready" })
    ).not.toBeInTheDocument();
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "download_success",
      expect.objectContaining({ surface: "mobile", pro: true })
    );
    expect(mockedTrackEvent).not.toHaveBeenCalledWith(
      "download_gate_shown",
      expect.anything()
    );
  });
});
