import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UploadZone } from "@/components/UploadZone";
import { normalizeDocumentUpload } from "@/lib/document-intake";
import { isFieldSuggestionReviewEnabled } from "@/lib/field-suggestion-rollout";

jest.mock("lucide-react", () => new Proxy({}, {
  get: () => {
    const MockIcon = () => <span data-testid="icon" />;
    return MockIcon;
  },
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
  isFieldSuggestionReviewEnabled: jest.fn(() => false),
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
const mockedRolloutEnabled = isFieldSuggestionReviewEnabled as jest.MockedFunction<typeof isFieldSuggestionReviewEnabled>;

function pickFile(file: File) {
  const input = screen.getByTestId("document-upload-input");
  fireEvent.change(input, { target: { files: [file] } });
}

describe("UploadZone photo cleanup wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRolloutEnabled.mockReturnValue(false);
    mockedNormalize.mockResolvedValue({
      fileName: "cleaned.pdf",
      pdfBytes: new ArrayBuffer(8),
      sourceType: "image",
      skipAcroFormDetection: true,
    });
  });

  it("routes image uploads through the cleanup modal before loading", async () => {
    const onFileLoad = jest.fn();
    render(<UploadZone onFileLoad={onFileLoad} />);

    pickFile(new File([new Uint8Array([1])], "photo.png", { type: "image/png" }));

    expect(await screen.findByTestId("photo-cleanup-modal")).toBeInTheDocument();
    expect(onFileLoad).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mock use photo" }));

    await waitFor(() => {
      expect(mockedNormalize).toHaveBeenCalledTimes(1);
    });
    expect((mockedNormalize.mock.calls[0][0] as File).name).toBe("cleaned-photo.png");
    await waitFor(() => {
      expect(onFileLoad).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("photo-cleanup-modal")).not.toBeInTheDocument();
    expect(onFileLoad).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "image" }));
  });

  it("keeps the local action hidden when the rollout is disabled", async () => {
    render(<UploadZone onFileLoad={jest.fn()} />);
    pickFile(new File([new Uint8Array([1])], "photo.png", { type: "image/png" }));

    expect(await screen.findByTestId("photo-cleanup-modal")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mock make fillable" })).not.toBeInTheDocument();
  });

  it("passes a revision-bound local suggestion request only for the gated action", async () => {
    mockedRolloutEnabled.mockReturnValue(true);
    const onFileLoad = jest.fn();
    render(<UploadZone onFileLoad={onFileLoad} />);
    pickFile(new File([new Uint8Array([1])], "photo.png", { type: "image/png" }));

    fireEvent.click(await screen.findByRole("button", { name: "Mock make fillable" }));

    await waitFor(() => expect(onFileLoad).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "image" }),
      {
        requestFieldSuggestions: true,
        documentRevision: `qf-document-v1-${"a".repeat(64)}`,
      },
    ));
  });

  it("cancel aborts the photo upload entirely", async () => {
    const onFileLoad = jest.fn();
    render(<UploadZone onFileLoad={onFileLoad} />);

    pickFile(new File([new Uint8Array([1])], "photo.jpg", { type: "image/jpeg" }));

    expect(await screen.findByTestId("photo-cleanup-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mock cancel" }));

    await waitFor(() => {
      expect(screen.queryByTestId("photo-cleanup-modal")).not.toBeInTheDocument();
    });
    expect(mockedNormalize).not.toHaveBeenCalled();
    expect(onFileLoad).not.toHaveBeenCalled();
  });

  it("PDF uploads bypass the cleanup modal", async () => {
    const onFileLoad = jest.fn();
    render(<UploadZone onFileLoad={onFileLoad} />);

    pickFile(new File([new Uint8Array([1])], "form.pdf", { type: "application/pdf" }));

    await waitFor(() => {
      expect(onFileLoad).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("photo-cleanup-modal")).not.toBeInTheDocument();
    expect((mockedNormalize.mock.calls[0][0] as File).name).toBe("form.pdf");
  });
});
