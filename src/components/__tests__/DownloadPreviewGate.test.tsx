import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DownloadPreviewGate } from "../DownloadPreviewGate";

jest.mock("lucide-react", () => ({
  FileText: () => <div data-testid="file-icon" />,
}));

interface TestProps {
  open: boolean;
  onClose: jest.Mock;
  previewDataUrl: string | null;
  fileName: string;
  pageCount?: number;
  renderPagePreview?: (pageIndex: number) => Promise<string | null>;
  checkoutSource?: string;
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

  it("checkoutSource prop rewrites both checkout hrefs", () => {
    renderGate({ checkoutSource: "download_preview_gate_mobile" });

    expect(screen.getByRole("link", { name: "Unlock download for A$2" })).toHaveAttribute(
      "href",
      "/checkout?plan=pro&billing=monthly&source=download_preview_gate_mobile"
    );
    expect(screen.getByRole("link", { name: "Prefer annual? A$149/year" })).toHaveAttribute(
      "href",
      "/checkout?plan=pro&billing=annual&source=download_preview_gate_mobile"
    );
  });

  it("does not render when open=false", () => {
    renderGate({ open: false });

    expect(screen.queryByRole("heading", { name: "Your document is ready" })).not.toBeInTheDocument();
  });
});

describe("DownloadPreviewGate multi-page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("hides page navigation completely for single-page documents", () => {
    renderGate({ pageCount: 1 });

    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });

  it("opens on page 1 with Previous disabled and an accurate page label", () => {
    renderGate({ pageCount: 3 });

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("navigates with Next/Previous and disables Next on the final page", () => {
    renderGate({ pageCount: 2 });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("lazily generates page previews and caches already viewed pages", async () => {
    const renderPagePreview = jest.fn(async (pageIndex: number) => `data:image/png;base64,page${pageIndex}`);
    renderGate({ previewDataUrl: null, pageCount: 3, renderPagePreview });

    // Page 1 generates when the gate opens.
    await waitFor(() => expect(renderPagePreview).toHaveBeenCalledWith(0));
    expect(await screen.findByAltText("Document preview")).toHaveAttribute(
      "src",
      "data:image/png;base64,page0"
    );

    // Page 2 generates on first visit.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(screen.getByAltText("Document preview")).toHaveAttribute(
        "src",
        "data:image/png;base64,page1"
      )
    );

    // Returning to page 1 is served from the cache: no extra calls.
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByAltText("Document preview")).toHaveAttribute(
      "src",
      "data:image/png;base64,page0"
    );
    expect(renderPagePreview).toHaveBeenCalledTimes(2);
  });

  it("does not regenerate page 1 when previewDataUrl is supplied", async () => {
    const renderPagePreview = jest.fn(async (pageIndex: number) => `data:image/png;base64,page${pageIndex}`);
    renderGate({ previewDataUrl: "data:image/png;base64,seeded", pageCount: 2, renderPagePreview });

    expect(screen.getByAltText("Document preview")).toHaveAttribute(
      "src",
      "data:image/png;base64,seeded"
    );
    await waitFor(() => expect(renderPagePreview).not.toHaveBeenCalledWith(0));
  });

  it("shows a loading placeholder while a page preview generates", async () => {
    let resolvePage: (url: string | null) => void = () => {};
    const renderPagePreview = jest.fn(
      () => new Promise<string | null>((resolve) => { resolvePage = resolve; })
    );
    renderGate({ previewDataUrl: null, pageCount: 2, renderPagePreview });

    expect(screen.getByLabelText("Document preview loading")).toBeInTheDocument();

    resolvePage("data:image/png;base64,slow0");
    expect(await screen.findByAltText("Document preview")).toHaveAttribute(
      "src",
      "data:image/png;base64,slow0"
    );
  });

  it("never shows a stale page under the wrong page number during rapid navigation", async () => {
    const resolvers = new Map<number, (url: string | null) => void>();
    const renderPagePreview = jest.fn(
      (pageIndex: number) =>
        new Promise<string | null>((resolve) => { resolvers.set(pageIndex, resolve); })
    );
    renderGate({ previewDataUrl: null, pageCount: 3, renderPagePreview });

    // Rapidly navigate to page 3 while pages 1 and 2 are still generating.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();

    // Earlier pages resolve late; the visible page must stay a placeholder
    // until its own preview arrives.
    await waitFor(() => expect(resolvers.has(0)).toBe(true));
    resolvers.get(0)?.("data:image/png;base64,late0");
    await waitFor(() => expect(resolvers.has(1)).toBe(true));
    resolvers.get(1)?.("data:image/png;base64,late1");

    expect(screen.getByLabelText("Document preview loading")).toBeInTheDocument();
    expect(screen.queryByAltText("Document preview")).not.toBeInTheDocument();

    await waitFor(() => expect(resolvers.has(2)).toBe(true));
    resolvers.get(2)?.("data:image/png;base64,page2");
    expect(await screen.findByAltText("Document preview")).toHaveAttribute(
      "src",
      "data:image/png;base64,page2"
    );

    // Cached late arrivals still serve instantly when navigating back.
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByAltText("Document preview")).toHaveAttribute(
      "src",
      "data:image/png;base64,late1"
    );
    expect(renderPagePreview).toHaveBeenCalledTimes(3);
  });

  it("resets to page 1 with a fresh cache when the gate reopens", async () => {
    const renderPagePreview = jest.fn(async (pageIndex: number) => `data:image/png;base64,page${pageIndex}`);
    const { rerender } = render(
      <DownloadPreviewGate
        {...defaultProps}
        previewDataUrl={null}
        pageCount={2}
        renderPagePreview={renderPagePreview}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    rerender(
      <DownloadPreviewGate
        {...defaultProps}
        open={false}
        previewDataUrl={null}
        pageCount={2}
        renderPagePreview={renderPagePreview}
      />
    );
    rerender(
      <DownloadPreviewGate
        {...defaultProps}
        previewDataUrl={null}
        pageCount={2}
        renderPagePreview={renderPagePreview}
      />
    );

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    // Reopening regenerates page 1 instead of trusting a stale cache.
    await waitFor(() => expect(renderPagePreview.mock.calls.filter(([p]) => p === 0)).toHaveLength(2));
  });
});
