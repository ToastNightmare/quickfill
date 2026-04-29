"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "@/components/Navbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdminRoute) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <footer className="mt-auto border-t border-border bg-surface py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <a href="/privacy" className="text-sm text-text-muted transition-colors hover:text-text">
              Privacy Policy
            </a>
            <a href="/terms" className="text-sm text-text-muted transition-colors hover:text-text">
              Terms of Service
            </a>
            <a href="mailto:support@getquickfill.com" className="text-sm text-text-muted transition-colors hover:text-text">
              Contact
            </a>
            <p className="text-xs text-text-muted/60">(c) 2026 QuickFill. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
