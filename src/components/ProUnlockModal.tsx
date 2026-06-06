"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles, Lock, X, Loader2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

interface ProUnlockModalProps {
  open: boolean;
  onClose: () => void;
  featureName?: string;
}

function isPaidUsage(data: { isPro?: boolean; tier?: string | null } | null): boolean {
  const tier = data?.tier ?? "free";
  return Boolean(data?.isPro || tier === "pro" || tier === "business");
}

export function ProUnlockModal({ open, onClose, featureName }: ProUnlockModalProps) {
  const [isPaid, setIsPaid] = useState<boolean | null>(null);

  useEffect(() => {
    if (open && isPaid === false) {
      trackEvent("upgrade_prompted", { feature: featureName ?? "pro_feature" });
    }
  }, [open, isPaid, featureName]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsPaid(null);

    fetch("/api/usage")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setIsPaid(isPaidUsage(data));
      })
      .catch(() => {
        if (!cancelled) setIsPaid(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const checkingPlan = isPaid === null;
  const paidPlan = isPaid === true;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-2xl text-center relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-5 ${
            paidPlan ? "bg-accent/15" : checkingPlan ? "bg-blue-500/15" : "bg-amber-500/15"
          }`}
        >
          {paidPlan ? (
            <CheckCircle2 className="h-8 w-8 text-accent" />
          ) : checkingPlan ? (
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          ) : (
            <Lock className="h-8 w-8 text-amber-500" />
          )}
        </div>

        <h2 className="text-xl font-bold mb-2">
          {paidPlan ? "You're already Pro" : checkingPlan ? "Loading your account" : "This is a Pro feature"}
        </h2>
        <p className="text-text-muted text-sm mb-6">
          {paidPlan
            ? `${featureName ?? "This feature"} is included in your active Pro plan.`
            : checkingPlan
              ? "One moment while QuickFill gets your account ready."
              : `${featureName ?? "This feature"} is available on the Pro plan. Upgrade for A$12/month to unlock unlimited fills and all templates.`}
        </p>

        <div className="bg-surface-alt rounded-xl p-4 mb-6 text-left">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="text-text-muted">Unlimited PDF fills</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="text-text-muted">All 13+ templates</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="text-text-muted">No watermarks</span>
            </div>
          </div>
        </div>

        {paidPlan ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Continue filling
          </button>
        ) : checkingPlan ? (
          <button
            type="button"
            disabled
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white opacity-70"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </button>
        ) : (
          <a
            href="/pricing"
            className="w-full h-11 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Upgrade to Pro
          </a>
        )}

        {!paidPlan && !checkingPlan && (
          <button
            onClick={onClose}
            className="mt-4 text-sm text-text-muted hover:text-text transition-colors"
          >
            Maybe later
          </button>
        )}
      </div>
    </div>
  );
}
