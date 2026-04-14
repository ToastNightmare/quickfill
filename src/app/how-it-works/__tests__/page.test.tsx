/**
 * Unit tests for How It Works page Pro-aware CTA rendering
 * Tests that free-tier CTAs are hidden for Pro users
 */

import { render, screen, waitFor } from "@testing-library/react";
import HowItWorksContent from "../content";

// Mock Clerk's useAuth
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
  ArrowRight: () => <div data-icon="arrow" />,
}));

const mockUseAuth = jest.requireMock("@clerk/nextjs").useAuth;

// Mock window.fetch for API calls
const originalFetch = global.fetch;

describe("HowItWorksContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock for useAuth
    mockUseAuth.mockReturnValue({ isSignedIn: false });

    // Mock fetch to return Pro status
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("CTA section for Pro users", () => {
    beforeEach(() => {
      // Mock signed-in Pro user
      mockUseAuth.mockReturnValue({ isSignedIn: true });

      // Mock /api/usage returning Pro status
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({ isPro: true, tier: "pro" }),
      });
    });

    it("should NOT render 'See Pricing' button for Pro users", async () => {
      render(<HowItWorksContent />);

      // Wait for usage data to load
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/usage");
      });

      // Verify See Pricing is NOT present
      const seePricingLink = screen.queryByText(/See Pricing/i);
      expect(seePricingLink).not.toBeInTheDocument();
    });

    it("should render 'Fill a PDF' button (not 'Fill a PDF Free') for Pro users", async () => {
      render(<HowItWorksContent />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/usage");
      });

      // Verify "Fill a PDF" button exists
      const fillPdfButton = screen.getByRole("link", { name: /Fill a PDF/i });
      expect(fillPdfButton).toBeInTheDocument();

      // Verify it's NOT the free version
      expect(screen.queryByText(/Fill a PDF Free/i)).not.toBeInTheDocument();
    });

    it("should render 'You're on Pro' subtitle for Pro users", async () => {
      render(<HowItWorksContent />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/usage");
      });

      // Verify Pro subtitle is present
      expect(screen.getByText(/You're on Pro/i)).toBeInTheDocument();
    });

    it("should NOT render 'Try free, no sign up needed' for Pro users", async () => {
      render(<HowItWorksContent />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/usage");
      });

      expect(
        screen.queryByText(/Try free, no sign up needed/i)
      ).not.toBeInTheDocument();
    });
  });

  describe("CTA section for free users", () => {
    beforeEach(() => {
      // Mock signed-in free user
      mockUseAuth.mockReturnValue({ isSignedIn: true });

      // Mock /api/usage returning free status
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({ isPro: false, tier: "free" }),
      });
    });

    it("should render 'See Pricing' button for free users", async () => {
      render(<HowItWorksContent />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/usage");
      });

      // Verify See Pricing IS present
      const seePricingLink = screen.getByRole("link", { name: /See Pricing/i });
      expect(seePricingLink).toBeInTheDocument();
    });

    it("should render 'Fill a PDF Free' button for free users", async () => {
      render(<HowItWorksContent />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/usage");
      });

      // Verify "Fill a PDF Free" button exists
      expect(screen.getByText(/Fill a PDF Free/i)).toBeInTheDocument();
    });

    it("should render 'Try free, no sign up needed' subtitle for free users", async () => {
      render(<HowItWorksContent />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/usage");
      });

      expect(screen.getByText(/Try free, no sign up needed/i)).toBeInTheDocument();
    });

    it("should NOT render 'You're on Pro' subtitle for free users", async () => {
      render(<HowItWorksContent />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/usage");
      });

      expect(screen.queryByText(/You're on Pro/i)).not.toBeInTheDocument();
    });
  });

  describe("CTA section for guest (not signed in) users", () => {
    beforeEach(() => {
      // Mock not signed in
      mockUseAuth.mockReturnValue({ isSignedIn: false });
    });

    it("should render 'See Pricing' button for guest users", () => {
      render(<HowItWorksContent />);

      // For guests, should show free tier CTAs
      const seePricingLink = screen.getByRole("link", { name: /See Pricing/i });
      expect(seePricingLink).toBeInTheDocument();
    });

    it("should render 'Fill a PDF Free' button for guest users", () => {
      render(<HowItWorksContent />);

      expect(screen.getByText(/Fill a PDF Free/i)).toBeInTheDocument();
    });
  });
});
