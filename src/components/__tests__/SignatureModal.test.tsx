import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignatureModal } from "@/components/SignatureModal";
import {
  analyzeSignaturePhoto,
  renderCleanedSignature,
  SIGNATURE_CLEANUP_DEFAULTS,
} from "@/lib/signature-image";

jest.mock("lucide-react", () => new Proxy({}, {
  get: () => {
    const MockIcon = () => <span data-testid="icon" />;
    return MockIcon;
  },
}));

jest.mock("@/components/SignaturePad", () => ({
  useSignaturePad: () => ({
    canvasElement: <canvas data-testid="signature-pad" />,
    clear: jest.fn(),
    toDataURL: jest.fn(() => "data:image/png;base64,drawn"),
    hasContent: false,
  }),
}));

jest.mock("@/lib/signature-image", () => {
  const actual = jest.requireActual("@/lib/signature-image");
  return {
    ...actual,
    analyzeSignaturePhoto: jest.fn(),
    renderCleanedSignature: jest.fn(),
  };
});

const mockAnalyze = analyzeSignaturePhoto as jest.MockedFunction<typeof analyzeSignaturePhoto>;
const mockRender = renderCleanedSignature as jest.MockedFunction<typeof renderCleanedSignature>;

const FAKE_ANALYSIS = {
  cropWidth: 4,
  cropHeight: 2,
  strengths: new Float32Array(8),
  colors: new Uint8ClampedArray(24),
};

function previewUrl(options?: { backgroundRemoval?: number; inkStrength?: number } | null) {
  const bg = options?.backgroundRemoval ?? 0;
  const ink = options?.inkStrength ?? 0;
  return `data:image/png;base64,cleaned-bg${bg}-ink${ink}`;
}

function openPhotoMode() {
  fireEvent.click(screen.getByRole("button", { name: "Photo" }));
}

async function uploadPhoto(container: HTMLElement) {
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
  expect(inputs.length).toBe(2);
  const file = new File([new Uint8Array([1, 2, 3])], "signature.jpg", { type: "image/jpeg" });
  fireEvent.change(inputs[1], { target: { files: [file] } });
  await waitFor(() => {
    expect(screen.getByAltText("Signature preview")).toBeInTheDocument();
  });
}

describe("SignatureModal photo cleanup controls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyze.mockResolvedValue(FAKE_ANALYSIS);
    mockRender.mockImplementation((_analysis, options) => previewUrl(options));
  });

  it("does not show cleanup sliders before a photo exists", () => {
    render(<SignatureModal open onClose={jest.fn()} onSave={jest.fn()} />);
    openPhotoMode();

    expect(screen.queryByTestId("signature-bg-fade")).not.toBeInTheDocument();
    expect(screen.queryByTestId("signature-ink-strength")).not.toBeInTheDocument();
    expect(screen.queryByTestId("signature-cleanup-reset")).not.toBeInTheDocument();
  });

  it("shows sliders after a photo is processed, with default preview", async () => {
    const { container } = render(
      <SignatureModal open onClose={jest.fn()} onSave={jest.fn()} />,
    );
    openPhotoMode();
    await uploadPhoto(container);

    expect(screen.getByTestId("signature-bg-fade")).toHaveValue("0");
    expect(screen.getByTestId("signature-ink-strength")).toHaveValue("0");
    expect(screen.getByAltText("Signature preview")).toHaveAttribute(
      "src",
      previewUrl(SIGNATURE_CLEANUP_DEFAULTS),
    );
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
  });

  it("updates the preview when the background fade slider changes", async () => {
    const { container } = render(
      <SignatureModal open onClose={jest.fn()} onSave={jest.fn()} />,
    );
    openPhotoMode();
    await uploadPhoto(container);

    fireEvent.change(screen.getByTestId("signature-bg-fade"), { target: { value: "80" } });

    await waitFor(() => {
      expect(screen.getByAltText("Signature preview")).toHaveAttribute(
        "src",
        previewUrl({ backgroundRemoval: 0.8, inkStrength: 0 }),
      );
    });
    expect(mockRender).toHaveBeenLastCalledWith(FAKE_ANALYSIS, {
      backgroundRemoval: 0.8,
      inkStrength: 0,
    });
  });

  it("updates the preview when the ink strength slider changes", async () => {
    const { container } = render(
      <SignatureModal open onClose={jest.fn()} onSave={jest.fn()} />,
    );
    openPhotoMode();
    await uploadPhoto(container);

    fireEvent.change(screen.getByTestId("signature-ink-strength"), { target: { value: "60" } });

    await waitFor(() => {
      expect(screen.getByAltText("Signature preview")).toHaveAttribute(
        "src",
        previewUrl({ backgroundRemoval: 0, inkStrength: 0.6 }),
      );
    });
  });

  it("reset restores default cleanup options and preview", async () => {
    const { container } = render(
      <SignatureModal open onClose={jest.fn()} onSave={jest.fn()} />,
    );
    openPhotoMode();
    await uploadPhoto(container);

    const resetButton = screen.getByTestId("signature-cleanup-reset");
    expect(resetButton).toBeDisabled();

    fireEvent.change(screen.getByTestId("signature-bg-fade"), { target: { value: "70" } });
    fireEvent.change(screen.getByTestId("signature-ink-strength"), { target: { value: "40" } });
    await waitFor(() => expect(resetButton).toBeEnabled());

    fireEvent.click(resetButton);

    expect(screen.getByTestId("signature-bg-fade")).toHaveValue("0");
    expect(screen.getByTestId("signature-ink-strength")).toHaveValue("0");
    await waitFor(() => {
      expect(screen.getByAltText("Signature preview")).toHaveAttribute(
        "src",
        previewUrl(SIGNATURE_CLEANUP_DEFAULTS),
      );
    });
    expect(resetButton).toBeDisabled();
  });

  it("saves the currently rendered cleaned signature", async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { container } = render(
      <SignatureModal open onClose={jest.fn()} onSave={onSave} />,
    );
    openPhotoMode();
    await uploadPhoto(container);

    fireEvent.change(screen.getByTestId("signature-bg-fade"), { target: { value: "50" } });
    await waitFor(() => {
      expect(screen.getByAltText("Signature preview")).toHaveAttribute(
        "src",
        previewUrl({ backgroundRemoval: 0.5, inkStrength: 0 }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Signature" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(previewUrl({ backgroundRemoval: 0.5, inkStrength: 0 }));
    });
  });

  it("clears sliders after retake", async () => {
    const { container } = render(
      <SignatureModal open onClose={jest.fn()} onSave={jest.fn()} />,
    );
    openPhotoMode();
    await uploadPhoto(container);

    fireEvent.click(screen.getByTitle("Retake"));

    expect(screen.queryByTestId("signature-bg-fade")).not.toBeInTheDocument();
    expect(screen.queryByAltText("Signature preview")).not.toBeInTheDocument();
  });
});
