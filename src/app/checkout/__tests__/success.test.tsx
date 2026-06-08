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
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

// Mock lucide-react icons
jest.mock("lucide-react", () => ({
  CheckCircle2: () => <div data-icon="check" />,
  FileText: () => <div data-icon="file" />,
  Loader2: () => <div data-icon="loader" />,
  RefreshCw: () => <div data-icon="refresh" />,
  Sparkles: () => <div data-icon="sparkles" />,
}));

// Mock window.fbq
const mockFbq = jest.fn();

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
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete (window as unknown as { fbq?: unknown }).fbq;
    jest.restoreAllMocks();
  });

  it("billing=monthly, status reaches ready -> fbq called with { value: 12.00, currency: 'AUD' }", async () => {
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
        value: 12.00,
        currency: "AUD",
      });
    });
  });

  it("billing=annual, status reaches ready -> fbq called with { value: 100.00, currency: 'AUD' }", async () => {
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
        value: 100.00,
        currency: "AUD",
      });
    });
  });

  it("billing param missing, status reaches ready -> fbq called with { value: 12.00, currency: 'AUD' }", async () => {
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
        value: 12.00,
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
