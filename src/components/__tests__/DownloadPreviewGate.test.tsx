import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { DownloadPreviewGate } from "../DownloadPreviewGate";

jest.mock("lucide-react", () => ({
  FileText: () => <div data-testid="file-icon" />,
}));

interface TestProps {
  open: boolean;
  onClose: jest.Mock;
  previewDataUrl: string | null;
  fileName: string;
}

const defaultProps: TestProps = {
  open: true,
  onClose: jest.fn(),
  previewDataUrl: "data:image/png;base64,preview",
  fileName: "finished.pdf",
};

function renderGate(props: Partial<TestProps> = {}) {
  const mergedProps = { ...defaultProps, ...props };
  return render(<DownloadPreviewGate {...mergedProps} />);
}

describe("DownloadPreviewGate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders 'Your document is ready' heading when open", () => {
    renderGate();

    expect(screen.getByRole("heading", { name: "Your document is ready" })).toBeInTheDocument();
  });

  it("shows offer copy: A$2, A$25, A$149", () => {
    renderGate();

    expect(screen.getByText("Unlock your clean PDF today")).toBeInTheDocument();
    expect(screen.getByText("A$2 for 7 days, then A$25/month. Cancel anytime.")).toBeInTheDocument();
    expect(
      screen.getByText("Start with 7 days for A$2, then A$25/month after 7 days. Cancel anytime.")
    ).toBeInTheDocument();
  });

  it("shows 'Keep editing' button", () => {
    renderGate();

    expect(screen.getByRole("button", { name: "Keep editing" })).toBeInTheDocument();
  });

  it("calls onClose when Keep editing is clicked", () => {
    const onClose = jest.fn();
    renderGate({ onClose });

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("primary CTA links to correct checkout URL", () => {
    renderGate();

    expect(screen.getByRole("link", { name: "Unlock download for A$2" })).toHaveAttribute(
      "href",
      "/checkout?plan=pro&billing=monthly&source=download_preview_gate"
    );
  });

  it("annual CTA links to correct checkout URL", () => {
    renderGate();

    expect(screen.getByRole("link", { name: "Choose annual, A$149/year" })).toHaveAttribute(
      "href",
      "/checkout?plan=pro&billing=annual&source=download_preview_gate"
    );
  });

  it("shows placeholder when previewDataUrl is null", () => {
    renderGate({ previewDataUrl: null });

    expect(screen.getByLabelText("Document preview loading")).toBeInTheDocument();
    expect(screen.getByTestId("file-icon")).toBeInTheDocument();
  });

  it("renders preview image when previewDataUrl is provided", () => {
    renderGate({ previewDataUrl: "data:image/png;base64,abc" });

    expect(screen.getByAltText("Document preview")).toHaveAttribute("src", "data:image/png;base64,abc");
  });

  it("does not render when open=false", () => {
    renderGate({ open: false });

    expect(screen.queryByRole("heading", { name: "Your document is ready" })).not.toBeInTheDocument();
  });
});
