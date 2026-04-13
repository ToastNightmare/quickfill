"use client";

import { Sparkles, Lock, X } from "lucide-react";

interface ProUnlockModalProps {
  open: boolean;
  onClose: () => void;
  featureName?: string;
}

export function ProUnlockModal({ open, onClose, featureName }: ProUnlockModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-2xl text-center relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Lock icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 mb-5">
          <Lock className="h-8 w-8 text-amber-500" />
        </div>

        {/* Headline */}
        <h2 className="text-xl font-bold mb-2">This is a Pro feature</h2>
        <p className="text-text-muted text-sm mb-6">
          {featureName
            ? `${featureName} is available on the Pro plan.`
            : "This feature is available on the Pro plan."}
          {" "}Upgrade for A$12/month to unlock unlimited fills and all templates.
        </p>

        {/* Benefits preview */}
        <div className="bg-surface-alt rounded-xl p-4 mb-6 text-left">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-accent">✓</span>
              <span className="text-text-muted">Unlimited PDF fills</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-accent">✓</span>
              <span className="text-text-muted">All 13+ templates</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-accent">✓</span>
              <span className="text-text-muted">No watermarks</span>
            </div>
          </div>
        </div>

        {/* CTA button */}
        <a
          href="/pricing"
          className="w-full h-11 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors flex items-center justify-center gap-2"
        >
          <Sparkles className="h-4 w-4" />
          Upgrade to Pro
        </a>

        {/* Cancel link */}
        <button
          onClick={onClose}
          className="mt-4 text-sm text-text-muted hover:text-text transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
