import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LandingUploadBox } from "@/components/LandingUploadBox";
import { normalizeDocumentUpload } from "@/lib/document-intake";
import { savePdfToIndexedDB } from "@/lib/persistence";
import {
  isFieldSuggestionReviewEnabled,
  storeFieldSuggestionIntent,
} from "@/lib/field-suggestion-rollout";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("lucide-react", () => new Proxy({}, {
  get: () => {
    const MockIcon = () => <span data-testid="icon" />;
    return MockIcon;
  },
}));

jest.mock("@/lib/persistence", () => ({
  savePdfToIndexedDB: jest.fn().mockResolvedValue(undefined),
  saveFileNameToLocalStorage: jest.fn(),
  clearEditorState: jest.fn().mockResolvedValue(undefined),
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

const mockedNormalize = normalizeDocumentUpload as jest.MockedFunction<typeof normalizeDocumentUpload>;
const mockedSavePdf = savePdfToIndexedDB as jest.MockedFunction<typeof savePdfToIndexedDB>;
const mockedRolloutEnabled = isFieldSuggestionReviewEnabled as jest.MockedFunction<typeof isFieldSuggestionReviewEnabled>;
const mockedStoreIntent = storeFieldSuggestionIntent as jest.MockedFunction<typeof storeFieldSuggestionIntent>;

function pickFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("LandingUploadBox photo cleanup wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockedRolloutEnabled.mockReturnValue(false);
    mockedNormalize.mockResolvedValue({
      fileName: "cleaned.pdf",
      pdfBytes: new ArrayBuffer(8),
      sourceType: "image",
      skipAcroFormDetection: true,
    });
  });

  it("shows truthful trust copy near the upload box", () => {
    render(<LandingUploadBox />);

    expect(
      screen.getByText("Your document stays in your browser while you edit. We don't store your document file on our servers.")
    ).toBeInTheDocument();
    expect(screen.getByText(/Free to fill and preview\. No account needed to start\./)).toBeInTheDocument();
  });

  it("shows a mobile/tablet Take a photo input with rear camera capture", () => {
    render(<LandingUploadBox />);

    const input = screen.getByLabelText("Take a photo");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png");
    expect(input).toHaveAttribute("capture", "environment");
    // Visible on phones and tablets, hidden only on large desktop layouts.
    expect(screen.getByRole("button", { name: "Take a photo" })).toHaveClass("lg:hidden");
    expect(screen.getByRole("button", { name: "Take a photo" })).not.toHaveClass("sm:hidden");
  });

  it("routes image uploads through the cleanup modal, then into the editor flow", async () => {
    render(<LandingUploadBox />);

    pickFile(new File([new Uint8Array([1])], "photo.png", { type: "image/png" }));

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
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/editor");
    });
    expect(sessionStorage.getItem("qf-photo-capture-source")).toBe("1");
    expect(mockedStoreIntent).not.toHaveBeenCalled();
  });

  it("keeps Make this fillable hidden while the rollout is off", async () => {
    render(<LandingUploadBox />);
    pickFile(new File([new Uint8Array([1])], "photo.png", { type: "image/png" }));

    expect(await screen.findByTestId("photo-cleanup-modal")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mock make fillable" })).not.toBeInTheDocument();
  });

  it("stores a revision-only one-shot intent for the gated local action", async () => {
    mockedRolloutEnabled.mockReturnValue(true);
    render(<LandingUploadBox />);
    pickFile(new File([new Uint8Array([1])], "photo.png", { type: "image/png" }));

    fireEvent.click(await screen.findByRole("button", { name: "Mock make fillable" }));

    await waitFor(() => expect(mockedStoreIntent).toHaveBeenCalledWith(`qf-document-v1-${"a".repeat(64)}`));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/editor"));
  });

  it("cancel aborts the landing photo upload", async () => {
    render(<LandingUploadBox />);

    pickFile(new File([new Uint8Array([1])], "photo.jpg", { type: "image/jpeg" }));

    expect(await screen.findByTestId("photo-cleanup-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mock cancel" }));

    await waitFor(() => {
      expect(screen.queryByTestId("photo-cleanup-modal")).not.toBeInTheDocument();
    });
    expect(mockedNormalize).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("PDF uploads bypass the cleanup modal", async () => {
    mockedNormalize.mockResolvedValueOnce({
      fileName: "form.pdf",
      pdfBytes: new ArrayBuffer(8),
      sourceType: "pdf",
      skipAcroFormDetection: false,
    });

    render(<LandingUploadBox />);

    pickFile(new File([new Uint8Array([1])], "form.pdf", { type: "application/pdf" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/editor");
    });
    expect(screen.queryByTestId("photo-cleanup-modal")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("qf-photo-capture-source")).toBeNull();
  });
});
