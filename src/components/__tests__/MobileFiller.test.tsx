import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MobileFiller } from "@/components/MobileFiller";
import { normalizeDocumentUpload } from "@/lib/document-intake";
import { savePdfToIndexedDB } from "@/lib/persistence";
import { detectAcroFormFields } from "@/lib/pdf-utils";
import { trackEvent } from "@/lib/analytics";

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
  SignatureModal: () => null,
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

function pickUploadFile(file: File) {
  const input = document.querySelector('input[accept*="application/pdf"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("MobileFiller photo cleanup wiring", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
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

describe("MobileFiller download gate", () => {
  const originalFetch = global.fetch;
  const originalCreateObjectURL = global.URL.createObjectURL;
  const originalRevokeObjectURL = global.URL.revokeObjectURL;
  const mockedDetect = detectAcroFormFields as jest.MockedFunction<typeof detectAcroFormFields>;
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
