import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MobileFiller } from "@/components/MobileFiller";
import { normalizeDocumentUpload } from "@/lib/document-intake";
import {
  loadFieldsFromLocalStorage,
  loadFileNameFromLocalStorage,
  loadPdfFromIndexedDB,
  saveFieldsToLocalStorage,
  savePdfToIndexedDB,
} from "@/lib/persistence";
import { detectAcroFormFields } from "@/lib/pdf-utils";
import { trackEvent, trackPrivacySafeEvent } from "@/lib/analytics";
import { loadPdfjsClient } from "@/lib/pdfjs-client";
import {
  renderFlattenedWhiteoutPages,
  WHITEOUT_REDACTION_ERROR_CODE,
  WHITEOUT_REDACTION_ERROR_MESSAGE,
} from "@/lib/pdf-flatten-client";
import {
  isFieldSuggestionReviewEnabled,
  storeFieldSuggestionIntent,
} from "@/lib/field-suggestion-rollout";
import { trackGoogleAdsCheckoutConversion } from "@/lib/gads";

const LOCAL_SIGNATURE = "data:image/png;base64,bG9jYWxTaWdMb2NhbA==";
const ACCOUNT_SIGNATURE = "data:image/png;base64,YWNjb3VudFNpZw==";
const SECOND_ACCOUNT_SIGNATURE = "data:image/png;base64,c2Vjb25kQWNjb3VudFNpZw==";
const DRAWN_SIGNATURE = "data:image/png;base64,ZHJhd25TaWc=";
const DOWNLOAD_PRESERVE_FLAG =
  "NEXT_PUBLIC_QUICKFILL_DOWNLOAD_PRESERVE";
const MOBILE_POLISH_FLAG =
  "NEXT_PUBLIC_QUICKFILL_MOBILE_POLISH";
const originalDownloadPreserveFlag =
  process.env[DOWNLOAD_PRESERVE_FLAG];
const originalMobilePolishFlag =
  process.env[MOBILE_POLISH_FLAG];

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
  loadFieldsFromLocalStorage: jest.fn(() => []),
  loadFileNameFromLocalStorage: jest.fn(() => ""),
  loadPdfFromIndexedDB: jest.fn().mockResolvedValue(null),
  saveFieldsToLocalStorage: jest.fn(() => true),
  saveFileNameToLocalStorage: jest.fn(),
  savePageToLocalStorage: jest.fn(),
  savePdfToIndexedDB: jest.fn().mockResolvedValue(true),
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
  trackPrivacySafeEvent: jest.fn(),
}));

jest.mock("@/lib/gads", () => ({
  trackGoogleAdsCheckoutConversion: jest.fn(),
}));

jest.mock("@/lib/pdfjs-client", () => ({
  loadPdfjsClient: jest.fn().mockRejectedValue(new Error("pdfjs disabled in tests")),
}));

jest.mock("@/lib/pdf-flatten-client", () => {
  const actual = jest.requireActual("@/lib/pdf-flatten-client");
  return {
    ...actual,
    renderFlattenedWhiteoutPages: jest.fn().mockResolvedValue([]),
  };
});

jest.mock("@/lib/profile-autofill", () => ({
  autofillModeFromFlag: jest.fn(() => "off"),
  runProfileAutofill: jest.fn(),
}));

const mockedNormalize = normalizeDocumentUpload as jest.MockedFunction<typeof normalizeDocumentUpload>;
const mockedSavePdf = savePdfToIndexedDB as jest.MockedFunction<typeof savePdfToIndexedDB>;
const mockedSaveFields =
  saveFieldsToLocalStorage as jest.MockedFunction<typeof saveFieldsToLocalStorage>;
const mockedLoadPdf = loadPdfFromIndexedDB as jest.MockedFunction<typeof loadPdfFromIndexedDB>;
const mockedLoadFields = loadFieldsFromLocalStorage as jest.MockedFunction<typeof loadFieldsFromLocalStorage>;
const mockedLoadFileName = loadFileNameFromLocalStorage as jest.MockedFunction<typeof loadFileNameFromLocalStorage>;
const mockedDetect = detectAcroFormFields as jest.MockedFunction<typeof detectAcroFormFields>;
const mockedRolloutEnabled = isFieldSuggestionReviewEnabled as jest.MockedFunction<typeof isFieldSuggestionReviewEnabled>;
const mockedStoreIntent = storeFieldSuggestionIntent as jest.MockedFunction<typeof storeFieldSuggestionIntent>;
const mockedLoadPdfjsClient = loadPdfjsClient as jest.MockedFunction<typeof loadPdfjsClient>;
const mockedRenderFlattenedWhiteoutPages =
  renderFlattenedWhiteoutPages as jest.MockedFunction<typeof renderFlattenedWhiteoutPages>;
const mockedTrackGoogleAdsCheckoutConversion =
  trackGoogleAdsCheckoutConversion as jest.MockedFunction<
    typeof trackGoogleAdsCheckoutConversion
  >;

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
  mockedLoadPdf.mockReset().mockResolvedValue(null);
  mockedLoadFields.mockReset().mockReturnValue([]);
  mockedLoadFileName.mockReset().mockReturnValue("");
  mockedSavePdf.mockReset().mockResolvedValue(true);
  mockedSaveFields.mockReset().mockReturnValue(true);
  delete process.env[MOBILE_POLISH_FLAG];
  localStorage.clear();
});

afterEach(() => {
  if (originalDownloadPreserveFlag === undefined) {
    delete process.env[DOWNLOAD_PRESERVE_FLAG];
  } else {
    process.env[DOWNLOAD_PRESERVE_FLAG] = originalDownloadPreserveFlag;
  }
  if (originalMobilePolishFlag === undefined) {
    delete process.env[MOBILE_POLISH_FLAG];
  } else {
    process.env[MOBILE_POLISH_FLAG] = originalMobilePolishFlag;
  }
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

describe("MobileFiller AcroForm fields", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("repairs duplicate widget IDs so same-name fields fill independently", async () => {
    mockedNormalize.mockResolvedValueOnce({
      fileName: "duplicate-fields.pdf",
      pdfBytes: new ArrayBuffer(8),
      sourceType: "pdf",
      skipAcroFormDetection: false,
    });
    mockedDetect.mockResolvedValueOnce([
      { name: "full_name", type: "text", x: 10, y: 10, width: 120, height: 20, page: 0, value: "" },
      { name: "full_name", type: "text", x: 10, y: 50, width: 120, height: 20, page: 0, value: "" },
    ]);

    render(<MobileFiller />);
    pickUploadFile(new File([new Uint8Array([1])], "duplicate-fields.pdf", {
      type: "application/pdf",
    }));

    const inputs = await screen.findAllByPlaceholderText("Type here");
    expect(inputs).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Open full editor" })).toHaveAttribute(
      "href",
      "/editor?advanced=1"
    );

    fireEvent.change(inputs[0], { target: { value: "First widget" } });
    expect(inputs[0]).toHaveValue("First widget");
    expect(inputs[1]).toHaveValue("");

    fireEvent.change(inputs[1], { target: { value: "Second widget" } });
    expect(inputs[0]).toHaveValue("First widget");
    expect(inputs[1]).toHaveValue("Second widget");
  });

  it("seeds checked and choice state only for the exact download-preserve flag", async () => {
    process.env[DOWNLOAD_PRESERVE_FLAG] = "v1";
    mockedNormalize.mockResolvedValueOnce({
      fileName: "seeded-fields.pdf",
      pdfBytes: new ArrayBuffer(8),
      sourceType: "pdf",
      skipAcroFormDetection: false,
    });
    mockedDetect.mockResolvedValueOnce([
      {
        name: "confirmed",
        type: "checkbox",
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        page: 0,
        value: "",
        checked: true,
        valueSource: "none",
      },
      {
        name: "region",
        type: "text",
        x: 10,
        y: 50,
        width: 120,
        height: 20,
        page: 0,
        value: "West",
        checked: false,
        valueSource: "choice",
      },
    ]);

    render(<MobileFiller />);
    pickUploadFile(new File([new Uint8Array([1])], "seeded-fields.pdf", {
      type: "application/pdf",
    }));

    expect(await screen.findByText("Checked")).toBeInTheDocument();
    expect(screen.getByDisplayValue("West")).toBeInTheDocument();
  });

  it("keeps new checkbox and choice seeding off for non-matching flag values", async () => {
    process.env[DOWNLOAD_PRESERVE_FLAG] = "true";
    mockedNormalize.mockResolvedValueOnce({
      fileName: "default-fields.pdf",
      pdfBytes: new ArrayBuffer(8),
      sourceType: "pdf",
      skipAcroFormDetection: false,
    });
    mockedDetect.mockResolvedValueOnce([
      {
        name: "confirmed",
        type: "checkbox",
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        page: 0,
        value: "",
        checked: true,
        valueSource: "none",
      },
      {
        name: "region",
        type: "text",
        x: 10,
        y: 50,
        width: 120,
        height: 20,
        page: 0,
        value: "West",
        checked: false,
        valueSource: "choice",
      },
    ]);

    render(<MobileFiller />);
    pickUploadFile(new File([new Uint8Array([1])], "default-fields.pdf", {
      type: "application/pdf",
    }));

    expect(await screen.findByText("Tap to check")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type here")).toHaveValue("");
  });

  it("renders one-card radio chips, a single-select menu, and the multiselect text fallback", async () => {
    process.env[MOBILE_POLISH_FLAG] = "v1";
    mockedNormalize.mockResolvedValueOnce({
      fileName: "choice-fields.pdf",
      pdfBytes: new ArrayBuffer(8),
      sourceType: "pdf",
      skipAcroFormDetection: false,
    });
    mockedDetect.mockResolvedValueOnce([
      {
        name: "contact_method",
        type: "text",
        kind: "radio",
        options: ["Email", "Phone"],
        currentSelection: "Phone",
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        page: 0,
        value: "Phone",
      },
      {
        name: "region",
        type: "text",
        kind: "choice",
        options: ["North", "West"],
        currentSelection: "",
        x: 10,
        y: 50,
        width: 120,
        height: 20,
        page: 0,
        value: "",
      },
      {
        name: "services",
        type: "text",
        kind: "choice",
        options: ["Support", "Training", "Hosting"],
        currentSelection: "Support, Hosting",
        multiselect: true,
        x: 10,
        y: 90,
        width: 120,
        height: 40,
        page: 0,
        value: "Support, Hosting",
      },
    ]);

    render(<MobileFiller />);
    pickUploadFile(new File([new Uint8Array([1])], "choice-fields.pdf", {
      type: "application/pdf",
    }));

    const email = await screen.findByRole("radio", { name: "Email" });
    const phone = screen.getByRole("radio", { name: "Phone" });
    expect(phone).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("2 of 3 filled")).toBeInTheDocument();

    fireEvent.click(email);
    expect(email).toHaveAttribute("aria-checked", "true");
    fireEvent.change(screen.getByRole("combobox", { name: "Region" }), {
      target: { value: "West" },
    });

    expect(screen.getByDisplayValue("Support, Hosting")).toHaveAttribute(
      "placeholder",
      "Type here",
    );
    expect(screen.getByText("3 of 3 filled")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("keeps the old text card for a non-matching mobile flag value", async () => {
    process.env[MOBILE_POLISH_FLAG] = "true";
    process.env[DOWNLOAD_PRESERVE_FLAG] = "true";
    mockedNormalize.mockResolvedValueOnce({
      fileName: "default-choice.pdf",
      pdfBytes: new ArrayBuffer(8),
      sourceType: "pdf",
      skipAcroFormDetection: false,
    });
    mockedDetect.mockResolvedValueOnce([
      {
        name: "contact_method",
        type: "text",
        kind: "radio",
        options: ["Email", "Phone"],
        currentSelection: "Phone",
        valueSource: "choice",
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        page: 0,
        value: "Phone",
      },
    ]);

    render(<MobileFiller />);
    pickUploadFile(new File([new Uint8Array([1])], "default-choice.pdf", {
      type: "application/pdf",
    }));

    expect(await screen.findByPlaceholderText("Type here")).toHaveValue("");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
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
  const originalInnerWidth = window.innerWidth;
  const mockedTrackEvent = trackEvent as jest.MockedFunction<typeof trackEvent>;
  const mockedTrackPrivacySafeEvent =
    trackPrivacySafeEvent as jest.MockedFunction<typeof trackPrivacySafeEvent>;

  const fillPdfCalls: string[] = [];
  const fillPdfBodies: FormData[] = [];

  function mockFetchWithUsage(
    usage: Record<string, unknown>,
    fillPdfResponse?: Partial<Response> & Pick<Response, "ok">,
  ) {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/signature")) {
        return { ok: true, json: async () => ({}) } as Response;
      }
      if (url.includes("/api/usage")) {
        return { ok: true, json: async () => usage } as Response;
      }
      if (url.includes("/api/fill-pdf")) {
        fillPdfCalls.push(url);
        if (init?.body instanceof FormData) fillPdfBodies.push(init.body);
        return fillPdfResponse ?? {
          ok: true,
          status: 200,
          arrayBuffer: async () => new ArrayBuffer(8),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof global.fetch;
  }

  async function uploadAcroFormPdf(options: {
    pdfBytes?: ArrayBuffer;
    detectedFields?: Awaited<ReturnType<typeof detectAcroFormFields>>;
  } = {}) {
    const pdfBytes = options.pdfBytes ?? new ArrayBuffer(8);
    mockedNormalize.mockResolvedValueOnce({
      fileName: "form.pdf",
      pdfBytes,
      sourceType: "pdf",
      skipAcroFormDetection: false,
    });
    mockedDetect.mockResolvedValueOnce(options.detectedFields ?? [
      {
        name: "full_name",
        type: "text",
        x: 10,
        y: 10,
        width: 120,
        height: 20,
        page: 0,
        value: "",
      },
    ]);

    render(<MobileFiller />);
    pickUploadFile(new File([new Uint8Array([1])], "form.pdf", { type: "application/pdf" }));

    return screen.findByRole("button", { name: /Download PDF/i });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    fillPdfCalls.length = 0;
    fillPdfBodies.length = 0;
    global.URL.createObjectURL = jest.fn(() => "blob:mock");
    global.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.URL.createObjectURL = originalCreateObjectURL;
    global.URL.revokeObjectURL = originalRevokeObjectURL;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
    window.history.replaceState(null, "", "/");
    jest.useRealTimers();
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

  it("verifies current PDF and fields before opening the mobile gate", async () => {
    process.env[MOBILE_POLISH_FLAG] = "v1";
    const pdfBytes = Uint8Array.from([1, 2, 3, 4]).buffer;
    const persistedFields = [
      {
        id: "full_name",
        type: "text" as const,
        x: 10,
        y: 10,
        width: 120,
        height: 20,
        page: 0,
        value: "Kyle",
        fontSize: 12,
      },
    ];
    mockedLoadPdf.mockResolvedValue(pdfBytes);
    mockedLoadFields.mockReturnValue(persistedFields);
    mockFetchWithUsage({ isPro: false, used: 0, limit: 3, guest: true });

    const downloadButton = await uploadAcroFormPdf({ pdfBytes });
    mockedSaveFields.mockClear();
    fireEvent.change(screen.getByPlaceholderText("Type here"), {
      target: { value: "Kyle" },
    });
    fireEvent.click(downloadButton);

    expect(
      await screen.findByRole("heading", { name: "Your document is ready" }),
    ).toBeInTheDocument();
    expect(mockedSavePdf).toHaveBeenLastCalledWith(pdfBytes);
    expect(mockedSaveFields).toHaveBeenLastCalledWith(persistedFields);
    expect(
      localStorage.getItem("quickfill_mobile_filler_session_nonempty_fields"),
    ).toBe("1");

    const gateEventIndex = mockedTrackEvent.mock.calls.findIndex(
      ([name]) => name === "download_gate_shown",
    );
    expect(gateEventIndex).toBeGreaterThanOrEqual(0);
    expect(mockedSaveFields.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mockedTrackEvent.mock.invocationCallOrder[gateEventIndex],
    );
  });

  it("blocks the gate with dismissible exact copy when storage readback fails", async () => {
    process.env[MOBILE_POLISH_FLAG] = "v1";
    const pdfBytes = Uint8Array.from([4, 3, 2, 1]).buffer;
    const persistedFields = [
      {
        id: "full_name",
        type: "text" as const,
        x: 10,
        y: 10,
        width: 120,
        height: 20,
        page: 0,
        value: "",
        fontSize: 12,
      },
    ];
    mockedSavePdf
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mockedLoadPdf.mockResolvedValue(pdfBytes);
    mockedLoadFields.mockReturnValue(persistedFields);
    mockFetchWithUsage({ isPro: false, used: 0, limit: 3, guest: true });

    const downloadButton = await uploadAcroFormPdf({ pdfBytes });
    fireEvent.click(downloadButton);

    const message =
      "Your browser is blocking storage, so we can't bring you back to your document after payment. If you're in Private Browsing, please switch it off and try again.";
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Your document is ready" }),
    ).not.toBeInTheDocument();
    expect(fillPdfCalls).toHaveLength(0);
    expect(mockedTrackPrivacySafeEvent).toHaveBeenCalledWith(
      "mobile_storage_verification_failed",
      { surface: "mobile_filler", stage: "pre_gate" },
    );
    expect(JSON.stringify(mockedTrackPrivacySafeEvent.mock.calls)).not.toContain(
      "form.pdf",
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it("sends single-select choice markers while leaving multiselect on the text fallback", async () => {
    process.env[MOBILE_POLISH_FLAG] = "v1";
    mockFetchWithUsage({ isPro: true, tier: "pro", guest: false });
    const detectedFields: Awaited<ReturnType<typeof detectAcroFormFields>> = [
      {
        name: "contact",
        type: "text",
        kind: "radio",
        options: ["Email", "Phone"],
        currentSelection: "Phone",
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        page: 0,
        value: "Phone",
      },
      {
        name: "region",
        type: "text",
        kind: "choice",
        options: ["North", "West"],
        currentSelection: "North",
        x: 10,
        y: 50,
        width: 120,
        height: 20,
        page: 0,
        value: "North",
      },
      {
        name: "services",
        type: "text",
        kind: "choice",
        options: ["Support", "Training"],
        currentSelection: "Support, Training",
        multiselect: true,
        x: 10,
        y: 90,
        width: 120,
        height: 40,
        page: 0,
        value: "Support, Training",
      },
    ];

    const downloadButton = await uploadAcroFormPdf({ detectedFields });
    fireEvent.click(screen.getByRole("radio", { name: "Email" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Region" }), {
      target: { value: "West" },
    });
    fireEvent.change(screen.getByDisplayValue("Support, Training"), {
      target: { value: "Training" },
    });
    fireEvent.click(downloadButton);

    expect(await screen.findByRole("heading", { name: "All done!" })).toBeInTheDocument();
    expect(JSON.parse(String(fillPdfBodies[0].get("fields")))).toEqual([
      expect.objectContaining({
        id: "contact",
        type: "text",
        value: "Email",
        choice: true,
      }),
      expect.objectContaining({
        id: "region",
        type: "text",
        value: "West",
        choice: true,
      }),
      expect.not.objectContaining({ choice: true }),
    ]);
  });

  it("debounces rapid flag-on field persistence to one write after 300ms", async () => {
    process.env[MOBILE_POLISH_FLAG] = "v1";
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => (
      { ok: true, json: async () => ({}) } as Response
    ));

    await uploadAcroFormPdf();
    mockedSaveFields.mockClear();
    const input = screen.getByPlaceholderText("Type here");
    fireEvent.change(input, { target: { value: "K" } });
    fireEvent.change(input, { target: { value: "Ky" } });
    fireEvent.change(input, { target: { value: "Kyle" } });

    act(() => jest.advanceTimersByTime(299));
    expect(mockedSaveFields).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(mockedSaveFields).toHaveBeenCalledTimes(1);
    expect(mockedSaveFields).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "full_name", value: "Kyle" }),
    ]);
  });

  it("flushes a pending flag-on field write on pagehide", async () => {
    process.env[MOBILE_POLISH_FLAG] = "v1";
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => (
      { ok: true, json: async () => ({}) } as Response
    ));

    await uploadAcroFormPdf();
    mockedSaveFields.mockClear();
    fireEvent.change(screen.getByPlaceholderText("Type here"), {
      target: { value: "Before leaving" },
    });
    act(() => window.dispatchEvent(new Event("pagehide")));

    expect(mockedSaveFields).toHaveBeenCalledTimes(1);
    expect(mockedSaveFields).toHaveBeenLastCalledWith([
      expect.objectContaining({ value: "Before leaving" }),
    ]);
    act(() => jest.advanceTimersByTime(300));
    expect(mockedSaveFields).toHaveBeenCalledTimes(1);
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
    expect(mockedTrackGoogleAdsCheckoutConversion).not.toHaveBeenCalled();
  });

  it("restores the simple session and completes a paid return download", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    window.history.replaceState(null, "", "/editor?download=ready");
    localStorage.setItem("quickfill_mobile_filler_session", "v1");
    mockAuthState.isSignedIn = true;
    mockAuthState.userId = "user_paid_return";
    mockAuthState.sessionId = "session_paid_return";
    mockedLoadPdf.mockResolvedValueOnce(new ArrayBuffer(8));
    mockedLoadFileName.mockReturnValueOnce("paid-return.pdf");
    mockedLoadFields.mockReturnValueOnce([
      {
        id: "full_name",
        type: "text",
        x: 10,
        y: 10,
        width: 120,
        height: 20,
        page: 0,
        value: "Kyle",
        fontSize: 12,
      },
    ]);
    mockedDetect.mockResolvedValueOnce([
      { name: "full_name", type: "text", x: 10, y: 10, width: 120, height: 20, page: 0, value: "" },
    ]);
    mockFetchWithUsage({ isPro: true, tier: "pro", guest: false });

    render(<MobileFiller restorePersistedSession />);

    expect(await screen.findByRole("heading", { name: "All done!" })).toBeInTheDocument();
    expect(fillPdfCalls).toHaveLength(1);
    expect(fillPdfBodies).toHaveLength(1);
    expect(JSON.parse(String(fillPdfBodies[0].get("fields")))).toEqual([
      expect.objectContaining({ id: "full_name", type: "text", value: "Kyle" }),
    ]);
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "download_success",
      expect.objectContaining({ surface: "mobile", pro: true }),
    );
    expect(mockedTrackGoogleAdsCheckoutConversion).toHaveBeenCalledTimes(1);
  });

  it("shows the paid-return recovery action when the saved PDF is missing", async () => {
    process.env[MOBILE_POLISH_FLAG] = "v1";
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    localStorage.setItem("quickfill_mobile_filler_session", "v1");
    mockedLoadPdf.mockResolvedValueOnce(null);

    render(<MobileFiller restorePersistedSession />);

    expect(
      await screen.findByText(
        "We couldn't restore your document. Your payment went through — choose the same file again and your Pro download will work.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose file" })).toBeEnabled();
  });

  it("shows the paid-return recovery action when marked nonempty fields restore empty", async () => {
    process.env[MOBILE_POLISH_FLAG] = "v1";
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    localStorage.setItem("quickfill_mobile_filler_session", "v1");
    localStorage.setItem(
      "quickfill_mobile_filler_session_nonempty_fields",
      "1",
    );
    mockedLoadPdf.mockResolvedValueOnce(new ArrayBuffer(8));
    mockedLoadFields.mockReturnValueOnce([]);
    mockedDetect.mockResolvedValueOnce([
      {
        name: "full_name",
        type: "text",
        x: 10,
        y: 10,
        width: 120,
        height: 20,
        page: 0,
        value: "",
      },
    ]);

    render(<MobileFiller restorePersistedSession />);

    expect(
      await screen.findByText(
        "We couldn't restore your document. Your payment went through — choose the same file again and your Pro download will work.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose file" })).toBeEnabled();
  });

  it("renders and sends flattened whiteout pages before a mobile download", async () => {
    const flattenedDataUrl = "data:image/png;base64,c2VjdXJlLXdoaXRlb3V0";
    const pdfProxy = { numPages: 1, getPage: jest.fn() };
    const destroy = jest.fn().mockResolvedValue(undefined);

    mockFetchWithUsage({ isPro: true, tier: "pro", guest: false });
    mockedNormalize.mockResolvedValueOnce({
      fileName: "whiteout-form.pdf",
      pdfBytes: new ArrayBuffer(8),
      sourceType: "pdf",
      skipAcroFormDetection: false,
    });
    mockedDetect.mockResolvedValueOnce([
      {
        name: "secure_area",
        type: "whiteout",
        x: 10,
        y: 20,
        width: 120,
        height: 30,
        page: 0,
        value: "",
      },
    ] as never);
    mockedLoadPdfjsClient.mockResolvedValueOnce({
      getDocument: () => ({
        promise: Promise.resolve(pdfProxy),
        destroy,
      }),
    } as never);
    mockedRenderFlattenedWhiteoutPages.mockResolvedValueOnce([[0, flattenedDataUrl]]);

    render(<MobileFiller />);
    pickUploadFile(new File([new Uint8Array([1])], "whiteout-form.pdf", {
      type: "application/pdf",
    }));
    fireEvent.click(await screen.findByRole("button", { name: /Download PDF/i }));

    expect(await screen.findByRole("heading", { name: "All done!" })).toBeInTheDocument();
    expect(mockedRenderFlattenedWhiteoutPages).toHaveBeenCalledWith(
      pdfProxy,
      [expect.objectContaining({ type: "whiteout", fillColor: "#ffffff" })],
    );
    expect(fillPdfBodies).toHaveLength(1);
    expect(fillPdfBodies[0].get("flattenedPages")).toBe(
      JSON.stringify([[0, flattenedDataUrl]]),
    );
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("maps the fail-closed whiteout code to the secure mobile message", async () => {
    mockFetchWithUsage(
      { isPro: true, tier: "pro", guest: false },
      {
        ok: false,
        status: 422,
        json: async () => ({
          error: "Server wording should not override the secure client message.",
          code: WHITEOUT_REDACTION_ERROR_CODE,
        }),
      } as Response,
    );

    const downloadButton = await uploadAcroFormPdf();
    fireEvent.click(downloadButton);

    expect(await screen.findByText(WHITEOUT_REDACTION_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "All done!" })).not.toBeInTheDocument();
    expect(mockedTrackEvent).not.toHaveBeenCalledWith(
      "download_success",
      expect.anything(),
    );
  });
});
