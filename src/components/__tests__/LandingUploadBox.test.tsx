import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LandingUploadBox } from "@/components/LandingUploadBox";
import { normalizeDocumentUpload } from "@/lib/document-intake";
import { savePdfToIndexedDB } from "@/lib/persistence";

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

const mockedNormalize = normalizeDocumentUpload as jest.MockedFunction<typeof normalizeDocumentUpload>;
const mockedSavePdf = savePdfToIndexedDB as jest.MockedFunction<typeof savePdfToIndexedDB>;

function pickFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("LandingUploadBox photo cleanup wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedNormalize.mockResolvedValue({
      fileName: "cleaned.pdf",
      pdfBytes: new ArrayBuffer(8),
      sourceType: "image",
      skipAcroFormDetection: true,
    });
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
    render(<LandingUploadBox />);

    pickFile(new File([new Uint8Array([1])], "form.pdf", { type: "application/pdf" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/editor");
    });
    expect(screen.queryByTestId("photo-cleanup-modal")).not.toBeInTheDocument();
  });
});
