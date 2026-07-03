/**
 * Unit tests for Checkout Success page Purchase event tracking
 * Tests fbq('track', 'Purchase') fires correctly under various conditions
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import CheckoutSuccessPage from "../success/page";

// Mock useSearchParams
const mockUseSearchParams = jest.fn();
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

// Mock Clerk's useAuth (if used)
jest.mock("@clerk/nextjs", () => ({
  useAuth: jest.fn(),
}));

// Mock next/link
jest.mock("next/link", () => {
  const MockLink = ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

// Mock lucide-react icons
jest.mock("lucide-react", () => ({
  CheckCircle2: () => <div data-icon="check" />,
  Download: () => <div data-icon="download" />,
  FileText: () => <div data-icon="file" />,
  Loader2: () => <div data-icon="loader" />,
  RefreshCw: () => <div data-icon="refresh" />,
  Sparkles: () => <div data-icon="sparkles" />,
}));

// Mock window.fbq
const mockFbq = jest.fn();

// Mock google-ads
const mockTrackGoogleAdsConversion = jest.fn();
jest.mock("@/lib/google-ads", () => ({
  trackGoogleAdsConversion: (...args: unknown[]) => mockTrackGoogleAdsConversion(...args),
}));

// Mock fetch
const originalFetch = global.fetch;

function setupSearchParams(params: Record<string, string>) {
  mockUseSearchParams.mockReturnValue({
    get: jest.fn((key: string) => params[key] ?? null),
  });
}

function setupFbq() {
  (window as unknown as { fbq?: typeof mockFbq }).fbq = mockFbq;
}

function setupSessionStorage() {
  const store: Record<string, string> = {};
  jest.spyOn(Storage.prototype, "getItem").mockImplementation((key: string) => store[key] ?? null);
  jest.spyOn(Storage.prototype, "setItem").mockImplementation((key: string, value: string) => {
    store[key] = value;
  });
}

describe("CheckoutSuccessPage - Purchase Event", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupSessionStorage();
    mockFbq.mockClear();
    mockTrackGoogleAdsConversion.mockClear();
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL = 'jzjNCNyf970cEP-s4vzD';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete (window as unknown as { fbq?: unknown }).fbq;
    jest.restoreAllMocks();
  });

  it("billing=monthly, status reaches ready -> fbq called with { value: 2, currency: 'AUD' }", async () => {
    setupSearchParams({
      session_id: "test-session-123",
      billing: "monthly",
      synced: "true",
    });
    setupFbq();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockFbq).toHaveBeenCalledWith("track", "Purchase", {
        value: 2,
        currency: "AUD",
      });
    });
  });

  it("billing=annual, status reaches ready -> fbq called with { value: 149, currency: 'AUD' }", async () => {
    setupSearchParams({
      session_id: "test-session-456",
      billing: "annual",
      synced: "true",
    });
    setupFbq();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockFbq).toHaveBeenCalledWith("track", "Purchase", {
        value: 149,
        currency: "AUD",
      });
    });
  });

  it("billing param missing, status reaches ready -> fbq called with { value: 2, currency: 'AUD' }", async () => {
    setupSearchParams({
      session_id: "test-session-789",
      synced: "true",
    });
    setupFbq();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockFbq).toHaveBeenCalledWith("track", "Purchase", {
        value: 2,
        currency: "AUD",
      });
    });
  });

  it("alreadyPro=true, status is ready -> fbq NOT called", async () => {
    setupSearchParams({
      session_id: "test-session-abc",
      alreadyPro: "true",
      synced: "true",
    });
    setupFbq();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockFbq).not.toHaveBeenCalled();
    });
  });

  it("repair=true, status is ready -> fbq NOT called", async () => {
    setupSearchParams({
      session_id: "test-session-def",
      repair: "true",
      synced: "true",
    });
    setupFbq();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockFbq).not.toHaveBeenCalled();
    });
  });

  it("No session_id in URL -> fbq NOT called", async () => {
    setupSearchParams({
      billing: "monthly",
      synced: "true",
    });
    setupFbq();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockFbq).not.toHaveBeenCalled();
    });
  });

  it("status === waiting -> fbq NOT called", async () => {
    setupSearchParams({
      session_id: "test-session-ghi",
      billing: "monthly",
    });
    setupFbq();

    // Return ok: false with updated: 0 to trigger waiting state
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, result: { updated: 0 } }),
    });

    render(<CheckoutSuccessPage />);

    // Wait for waiting state message to appear
    await waitFor(() => {
      expect(screen.getByText(/QuickFill is finishing your Pro setup now/i)).toBeInTheDocument();
    });

    expect(mockFbq).not.toHaveBeenCalled();
  });

  it("status === error -> fbq NOT called", async () => {
    setupSearchParams({
      session_id: "test-session-jkl",
      billing: "monthly",
    });
    setupFbq();

    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockFbq).not.toHaveBeenCalled();
    });
  });

  it("Status reaches ready twice (simulate retry path) -> fbq called exactly once (sessionStorage dedup)", async () => {
    setupSearchParams({
      session_id: "test-session-mno",
      billing: "monthly",
    });
    setupFbq();

    let callCount = 0;
    (global.fetch as jest.Mock).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First call returns ok: false, updated: 0, status becomes "waiting"
        return {
          ok: true,
          json: async () => ({ ok: false, result: { updated: 0 } }),
        };
      }
      // Second call returns ok: true, updated: 1, status becomes "ready"
      return {
        ok: true,
        json: async () => ({ ok: true, result: { updated: 1 } }),
      };
    });

    render(<CheckoutSuccessPage />);

    // First sync returns ok: false, updated: 0, status becomes "waiting"
    await waitFor(() => {
      expect(screen.getByText(/QuickFill is finishing your Pro setup now/i)).toBeInTheDocument();
    });

    // Simulate retry by clicking the retry button
    const retryButton = screen.getByRole("button", { name: /check again/i });
    fireEvent.click(retryButton);

    // Second sync returns ok: true, updated: 1, status becomes "ready" and fbq is called
    await waitFor(() => {
      expect(mockFbq).toHaveBeenCalledTimes(1);
    });

    // The sessionStorage flag should prevent a second call even if status changes again
    expect(mockFbq).toHaveBeenCalledTimes(1);
  });

  it("window.fbq not defined -> no crash, no call", async () => {
    setupSearchParams({
      session_id: "test-session-pqr",
      billing: "monthly",
      synced: "true",
    });

    // Do NOT setup fbq - keep it undefined

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    expect(() => {
      render(<CheckoutSuccessPage />);
    }).not.toThrow();

    await waitFor(() => {
      expect(mockFbq).not.toHaveBeenCalled();
    });
  });
});

describe("CheckoutSuccessPage - Download Return CTA", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupSessionStorage();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("links back to the editor with download=ready", async () => {
    setupSearchParams({
      synced: "true",
    });

    render(<CheckoutSuccessPage />);

    expect(await screen.findByRole("link", { name: /download your document/i })).toHaveAttribute(
      "href",
      "/editor?download=ready"
    );
  });

  it("makes 'Download your document' the first, primary CTA", async () => {
    setupSearchParams({
      synced: "true",
    });

    render(<CheckoutSuccessPage />);

    const downloadLink = await screen.findByRole("link", { name: /download your document/i });
    const dashboardLink = screen.getByRole("link", { name: /go to dashboard/i });
    const fillLink = screen.getByRole("link", { name: /fill your first pro pdf/i });

    // Download comes first in DOM order.
    expect(
      downloadLink.compareDocumentPosition(dashboardLink) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      downloadLink.compareDocumentPosition(fillLink) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // Download is the accent-styled primary; the others are quiet secondaries.
    expect(downloadLink.className).toContain("bg-accent");
    expect(dashboardLink.className).not.toContain("bg-accent");
    expect(fillLink.className).not.toContain("bg-accent");
  });

  it("shows continuity reassurance copy", async () => {
    setupSearchParams({
      synced: "true",
    });

    render(<CheckoutSuccessPage />);

    expect(
      await screen.findByText("Your document and edits are saved right where you left them.")
    ).toBeInTheDocument();
  });
});

describe("CheckoutSuccessPage - Google Ads Conversion Event", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupSessionStorage();
    // Default: helper returns true so the dedup flag is set correctly.
    // Individual tests override this when testing the false-return path.
    mockTrackGoogleAdsConversion.mockReturnValue(true);
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL = 'jzjNCNyf970cEP-s4vzD';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL;
  });

  it("billing=monthly, status reaches ready -> trackGoogleAdsConversion called with value 2", async () => {
    setupSearchParams({
      session_id: "gads-session-001",
      billing: "monthly",
      synced: "true",
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockTrackGoogleAdsConversion).toHaveBeenCalledWith(
        'jzjNCNyf970cEP-s4vzD',
        2,
        'AUD'
      );
    });
  });

  it("billing=annual, status reaches ready -> fires value 149", async () => {
    setupSearchParams({
      session_id: "gads-session-002",
      billing: "annual",
      synced: "true",
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockTrackGoogleAdsConversion).toHaveBeenCalledWith(
        'jzjNCNyf970cEP-s4vzD',
        149,
        'AUD'
      );
    });
  });

  it("alreadyPro=true -> trackGoogleAdsConversion NOT called", async () => {
    setupSearchParams({
      session_id: "gads-session-003",
      alreadyPro: "true",
      synced: "true",
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockTrackGoogleAdsConversion).not.toHaveBeenCalled();
    });
  });

  it("repair=true -> trackGoogleAdsConversion NOT called", async () => {
    setupSearchParams({
      session_id: "gads-session-004",
      repair: "true",
      synced: "true",
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockTrackGoogleAdsConversion).not.toHaveBeenCalled();
    });
  });

  it("no session_id -> trackGoogleAdsConversion NOT called", async () => {
    setupSearchParams({
      billing: "monthly",
      synced: "true",
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockTrackGoogleAdsConversion).not.toHaveBeenCalled();
    });
  });

  it("status === waiting -> trackGoogleAdsConversion NOT called", async () => {
    setupSearchParams({
      session_id: "gads-session-005",
      billing: "monthly",
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, result: { updated: 0 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(screen.getByText(/QuickFill is finishing your Pro setup now/i)).toBeInTheDocument();
    });

    expect(mockTrackGoogleAdsConversion).not.toHaveBeenCalled();
  });

  it("status === error -> trackGoogleAdsConversion NOT called", async () => {
    setupSearchParams({
      session_id: "gads-session-006",
      billing: "monthly",
    });

    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockTrackGoogleAdsConversion).not.toHaveBeenCalled();
    });
  });

  it("sessionStorage dedup - ready fires once, second render does NOT fire again", async () => {
    setupSearchParams({
      session_id: "gads-session-007",
      billing: "monthly",
      synced: "true",
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    const { unmount } = render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockTrackGoogleAdsConversion).toHaveBeenCalledTimes(1);
    });

    unmount();

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockTrackGoogleAdsConversion).toHaveBeenCalledTimes(1);
    });
  });

  it("conversion label env var missing -> trackGoogleAdsConversion NOT called", async () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL;

    setupSearchParams({
      session_id: "gads-session-008",
      billing: "monthly",
      synced: "true",
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockTrackGoogleAdsConversion).not.toHaveBeenCalled();
    });
  });

  it("trackGoogleAdsConversion returns false -> dedup key NOT set, conversion not silently lost", async () => {
    // Simulate the helper returning false (e.g. gtag not available, env var issue).
    // The dedup flag must NOT be written so the next page load can retry.
    mockTrackGoogleAdsConversion.mockReturnValue(false);

    const sessionStorageSetSpy = jest.spyOn(Storage.prototype, "setItem");

    setupSearchParams({
      session_id: "gads-session-009",
      billing: "monthly",
      synced: "true",
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { updated: 1 } }),
    });

    render(<CheckoutSuccessPage />);

    await waitFor(() => {
      expect(mockTrackGoogleAdsConversion).toHaveBeenCalledTimes(1);
    });

    // The dedup key must not have been written.
    const dedupKeyCalls = sessionStorageSetSpy.mock.calls.filter(
      ([key]) => key === "qf_gads_fired_gads-session-009"
    );
    expect(dedupKeyCalls).toHaveLength(0);
  });
});
