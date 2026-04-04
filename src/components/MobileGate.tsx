"use client";

import { useState } from "react";
import { Monitor, ArrowRight, AlertTriangle } from "lucide-react";

interface MobileGateProps {
  children: React.ReactNode;
}

export function MobileGate({ children }: MobileGateProps) {
  const [dismissed, setDismissed] = useState(false);

  // Only gate on small screens
  // We use a CSS-driven approach — no JS window.innerWidth so it works on SSR
  if (dismissed) return <>{children}</>;

  return (
    <>
      {/* Mobile gate — shown only on small screens */}
      <div className="sm:hidden flex flex-col items-center justify-center min-h-[calc(100svh-64px)] px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 mb-6">
          <Monitor className="h-8 w-8 text-amber-500" />
        </div>

        <h1 className="text-2xl font-bold text-text mb-3">
          Desktop works best
        </h1>
        <p className="text-text-muted text-base leading-relaxed mb-8 max-w-sm">
          QuickFill's PDF editor is built for mouse and keyboard. On mobile the experience is limited — open it on your laptop or desktop for the full thing.
        </p>

        {/* QR / open on desktop prompt */}
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-alt p-5 mb-6 text-left">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-text mb-1">To use the editor</p>
              <p className="text-sm text-text-muted">
                Visit <span className="font-medium text-accent">getquickfill.com/editor</span> on your laptop or desktop browser.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="flex items-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-medium text-text-muted hover:bg-surface-alt transition-colors"
        >
          Try on mobile anyway
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Desktop — always render children */}
      <div className="hidden sm:flex sm:flex-col sm:flex-1">
        {children}
      </div>
    </>
  );
}
