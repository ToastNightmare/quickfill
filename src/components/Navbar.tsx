"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, FileText } from "lucide-react";

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-navy">
          <FileText className="h-6 w-6 text-accent" />
          QuickFill
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 md:flex">
          <Link
            href="/editor"
            className="text-sm font-medium text-text-muted hover:text-text transition-colors"
          >
            Editor
          </Link>
          <Link
            href="/#pricing"
            className="text-sm font-medium text-text-muted hover:text-text transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/editor"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
          >
            Get Started
          </Link>
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
            <Link
              href="/editor"
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-surface-alt transition-colors"
            >
              Editor
            </Link>
            <Link
              href="/#pricing"
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-3 py-3 text-sm font-medium hover:bg-surface-alt transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/editor"
              onClick={() => setMenuOpen(false)}
              className="mt-1 rounded-lg bg-accent px-3 py-3 text-center text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
