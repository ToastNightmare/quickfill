import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PhotoCleanupModal } from "@/components/PhotoCleanupModal";
import { cleanupPhotoFile, renderCleanupPreview } from "@/lib/image-cleanup";

jest.mock("lucide-react", () => new Proxy({}, {
  get: () => {
    const MockIcon = () => <span data-testid="icon" />;
    return MockIcon;
  },
}));

jest.mock("@/lib/image-cleanup", () => {
  const actual = jest.requireActual("@/lib/image-cleanup");
  return {
    ...actual,
    renderCleanupPreview: jest.fn().mockResolvedValue(undefined),
    cleanupPhotoFile: jest.fn(),
  };
});

const mockedPreview = renderCleanupPreview as jest.MockedFunction<typeof renderCleanupPreview>;
const mockedCleanup = cleanupPhotoFile as jest.MockedFunction<typeof cleanupPhotoFile>;

const photo = new File([new Uint8Array([1, 2, 3])], "form.png", { type: "image/png" });

describe("PhotoCleanupModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPreview.mockResolvedValue(undefined);
  });

  it("renders the copy, preview, and controls with document mode on by default", async () => {
    render(<PhotoCleanupModal file={photo} onConfirm={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByRole("heading", { name: "Clean up photo" })).toBeInTheDocument();
    expect(screen.getByText("Rotate or improve the photo before adding it as a document page.")).toBeInTheDocument();
    expect(screen.getByTestId("photo-cleanup-preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rotate left" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rotate right" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Document mode" })).toBeChecked();

    await waitFor(() => {
      expect(mockedPreview).toHaveBeenCalledWith(
        photo,
        { rotateQuarterTurns: 0, documentMode: true },
        expect.anything()
      );
    });
  });

  it("rotate buttons update the preview orientation", async () => {
    render(<PhotoCleanupModal file={photo} onConfirm={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Rotate right" }));
    await waitFor(() => {
      expect(mockedPreview).toHaveBeenCalledWith(
        photo,
        { rotateQuarterTurns: 1, documentMode: true },
        expect.anything()
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Rotate left" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate left" }));
    await waitFor(() => {
      expect(mockedPreview).toHaveBeenCalledWith(
        photo,
        { rotateQuarterTurns: 3, documentMode: true },
        expect.anything()
      );
    });
  });

  it("document mode toggle updates the preview", async () => {
    render(<PhotoCleanupModal file={photo} onConfirm={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Document mode" }));

    expect(screen.getByRole("checkbox", { name: "Document mode" })).not.toBeChecked();
    await waitFor(() => {
      expect(mockedPreview).toHaveBeenCalledWith(
        photo,
        { rotateQuarterTurns: 0, documentMode: false },
        expect.anything()
      );
    });
  });

  it("Use photo returns the cleaned file with the chosen options", async () => {
    const cleaned = new File([new Uint8Array([9])], "form.jpg", { type: "image/jpeg" });
    mockedCleanup.mockResolvedValue(cleaned);
    const onConfirm = jest.fn();

    render(<PhotoCleanupModal file={photo} onConfirm={onConfirm} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rotate right" }));
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));

    await waitFor(() => {
      expect(mockedCleanup).toHaveBeenCalledWith(photo, { rotateQuarterTurns: 1, documentMode: true });
    });
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(cleaned);
    });
  });

  it("falls back to the original photo when cleanup fails", async () => {
    mockedCleanup.mockRejectedValue(new Error("boom"));
    const onConfirm = jest.fn();

    render(<PhotoCleanupModal file={photo} onConfirm={onConfirm} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(photo);
    });
  });

  it("Cancel aborts without confirming", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(<PhotoCleanupModal file={photo} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
