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

  it("shows one clean price block: A$2 headline and A$25/month subline", () => {
    renderGate();

    expect(screen.getByText("Unlock your clean download for A$2")).toBeInTheDocument();
    expect(screen.getByText("7-day intro, then A$25/month. Cancel anytime.")).toBeInTheDocument();
    // Old repeated price copy is gone.
    expect(screen.queryByText("Unlock your clean PDF today")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Start with 7 days for A$2, then A$25/month after 7 days. Cancel anytime.")
    ).not.toBeInTheDocument();
  });

  it("shows trust microcopy near the CTA", () => {
    renderGate();

    expect(
      screen.getByText("We process your file to create the download, but we don't store your document file.")
    ).toBeInTheDocument();
  });

  it("shows exactly 4 value bullets", () => {
    renderGate();

    const list = screen.getByRole("list");
    const items = list.querySelectorAll("li");
    expect(items).toHaveLength(4);
    expect(screen.getByText("Clean PDF, no watermark")).toBeInTheDocument();
    expect(screen.getByText("Unlimited downloads")).toBeInTheDocument();
    expect(screen.getByText("Works with PDFs, photos and scans")).toBeInTheDocument();
    expect(screen.getByText("Secure checkout by Stripe, cancel anytime")).toBeInTheDocument();
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

  it("annual option is a quiet secondary link to the annual checkout URL", () => {
    renderGate();

    const annualLink = screen.getByRole("link", { name: "Prefer annual? A$149/year" });
    expect(annualLink).toHaveAttribute(
      "href",
      "/checkout?plan=pro&billing=annual&source=download_preview_gate"
    );
    // Quiet link styling, not a competing full-width button.
    expect(annualLink.className).toContain("underline");
    expect(annualLink.className).not.toContain("w-full");
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
