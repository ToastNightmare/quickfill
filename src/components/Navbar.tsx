"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth, UserButton } from "@clerk/nextjs";

interface UsageData {
  isPro: boolean;
  tier?: string;
}

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isSignedIn } = useAuth();
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    if (isSignedIn) {
      fetch("/api/usage")
        .then((r) => r.json())
        .then((data: UsageData) => setIsPro(data.isPro))
        .catch(() => setIsPro(false));
    }
  }, [isSignedIn]);

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center">
          <Logo variant="full" className="h-9 w-auto" />
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 md:flex">
          <Link href="/how-it-works" className="text-sm font-medium text-text-muted hover:text-text transition-colors">
            How It Works
          </Link>
          <Link href="/templates" className="text-sm font-medium text-text-muted hover:text-text transition-colors">
            Templates
          </Link>
          {isSignedIn && isPro ? (
            <form action="/api/stripe/portal" method="POST">
              <button type="submit" className="text-sm font-medium text-text-muted hover:text-text transition-colors">
                Billing
              </button>
            </form>
          ) : (
            <Link href="/pricing" className="text-sm font-medium text-text-muted hover:text-text transition-colors">
              Pricing
            </Link>
          )}
          <Link href="/editor" className="text-sm font-medium text-text-muted hover:text-text transition-colors">
            Fill a PDF
          </Link>

          {!isSignedIn ? (
            <>
              <Link href="/sign-in" className="text-sm font-medium text-text-muted hover:text-text transition-colors">
                Sign In
              </Link>
              <Link href="/sign-up" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover transition-colors">
                Try Free
              </Link>
            </>
          ) : (
            <>
              <Link href="/dashboard" className="text-sm font-medium text-text-muted hover:text-text transition-colors">
                Dashboard
              </Link>
              <Link href="/profile" className="text-sm font-medium text-text-muted hover:text-text transition-colors">
                Profile
              </Link>
              {isPro && (
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">
                  ✦ Pro
                </span>
              )}
              <UserButton appearance={{ elements: { avatarBox: "h-9 w-9" } }} />
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-11 w-11 items-center justify-center rounded-lg md:hidden hover:bg-surface-alt transition-colors"
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-border bg-surface px-4 pb-4 md:hidden">
          <div className="flex flex-col gap-2 pt-2">
            <Link href="/how-it-works" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-surface-alt transition-colors">
              How It Works
            </Link>
            <Link href="/templates" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-surface-alt transition-colors">
              Templates
            </Link>
            {isSignedIn && isPro ? (
              <form action="/api/stripe/portal" method="POST">
                <button type="submit" className="rounded-lg px-3 py-3 text-sm font-medium text-text-muted hover:bg-surface-alt transition-colors text-left">
                  Billing
                </button>
              </form>
            ) : (
              <Link href="/pricing" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-surface-alt transition-colors">
                Pricing
              </Link>
            )}
            <Link href="/editor" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-surface-alt transition-colors">
              Fill a PDF
            </Link>

            {!isSignedIn ? (
              <>
                <Link href="/sign-in" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-surface-alt transition-colors">
                  Sign In
                </Link>
                <Link href="/sign-up" onClick={() => setMenuOpen(false)} className="mt-1 rounded-lg bg-accent px-3 py-3 text-center text-sm font-semibold text-white hover:bg-accent-hover transition-colors">
                  Try Free
                </Link>
              </>
            ) : (
              <>
                <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-surface-alt transition-colors">
                  Dashboard
                </Link>
                <Link href="/profile" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-surface-alt transition-colors">
                  Profile
                </Link>
                {isPro && (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">
                    ✦ Pro
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
