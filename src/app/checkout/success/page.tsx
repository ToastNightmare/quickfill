"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Download, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { trackGoogleAdsConversion } from "@/lib/google-ads";
import { PRICING } from "@/lib/pricing";

type SyncStatus = "checking" | "ready" | "waiting" | "error";

const BILLING_SYNC_MESSAGES: Record<string, string> = {
  not_signed_in: "Your payment went through. Sign in again and QuickFill will finish setting up Pro.",
  rate_limited: "QuickFill is getting your account ready. Wait a moment, then check again.",
  sync_error: "Your payment went through, but QuickFill could not finish setting up Pro yet.",
};

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[70vh] items-center justify-center bg-surface-alt px-4 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </main>
      }
    >
      <CheckoutSuccessContent />
    </Suspense>
  );
}

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const syncAlreadyRan = searchParams.get("synced") === "true";
  const billingSyncReason = searchParams.get("billingSync");
  const sessionId = searchParams.get("session_id");
  const initialSyncError = billingSyncReason ? BILLING_SYNC_MESSAGES[billingSyncReason] : null;
  const [status, setStatus] = useState<SyncStatus>(() => {
    if (initialSyncError) return "error";
    if (syncAlreadyRan) return "ready";
    return "checking";
  });
  const [message, setMessage] = useState(() => {
    if (initialSyncError) return initialSyncError;
    if (syncAlreadyRan) return "Your QuickFill Pro access is active.";
    return "Getting your Pro workspace ready...";
  });
  const [retrying, setRetrying] = useState(false);

  const alreadyPro = searchParams.get("alreadyPro") === "true";
  const repairedBilling = searchParams.get("repair") === "true";

  const contextText = useMemo(() => {
    if (alreadyPro) return "You already have active Pro access.";
    if (repairedBilling) return "Your Pro access is being restored.";
    return "Your QuickFill Pro access is active. You can now download finished documents.";
  }, [alreadyPro, repairedBilling]);

  const syncBilling = useCallback(async () => {
    setStatus("checking");
    setMessage("Getting your account ready...");

    try {
      const res = await fetch("/api/billing/sync", {
        method: "POST",
        ...(sessionId
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId }),
            }
          : {}),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "QuickFill could not finish setting up Pro yet.");
      }

      const updated = Number(data.result?.updated ?? 0);
      const looksSynced = data.ok !== false || updated > 0;

      if (looksSynced) {
        setStatus("ready");
        setMessage("Your QuickFill Pro access is active.");
        return;
      }

      setStatus("waiting");
      setMessage("Your payment went through. QuickFill is finishing your Pro setup now.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Your payment went through, but QuickFill could not finish setting up Pro yet."
      );
    }
  }, [sessionId]);

  useEffect(() => {
    if (syncAlreadyRan || initialSyncError) return;
    syncBilling();
  }, [initialSyncError, syncAlreadyRan, syncBilling]);

  useEffect(() => {
    // Only fire on confirmed new purchases
    if (status !== "ready") return;
    if (alreadyPro || repairedBilling) return;
    if (!sessionId) return;

    const flagKey = `qf_purchase_fired_${sessionId}`;
    try {
      if (sessionStorage.getItem(flagKey)) return;
    } catch {
      return; // sessionStorage unavailable (private browsing restriction)
    }

    if (typeof window.fbq !== "function") return;

    const billing = searchParams.get("billing");
    const value = billing === "annual"
      ? PRICING.pro.annual.conversionValue
      : PRICING.pro.monthly.conversionValue;

    window.fbq("track", "Purchase", { value, currency: "AUD" });

    try {
      sessionStorage.setItem(flagKey, "1");
    } catch {
      // sessionStorage write failed - acceptable
    }
  }, [status, alreadyPro, repairedBilling, sessionId, searchParams]);

  useEffect(() => {
    // Only fire on confirmed new purchases
    if (status !== "ready") return;
    if (alreadyPro || repairedBilling) return;
    if (!sessionId) return;

    const flagKey = `qf_gads_fired_${sessionId}`;
    try {
      if (sessionStorage.getItem(flagKey)) return;
    } catch {
      return; // sessionStorage unavailable
    }

    const conversionLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL;
    if (!conversionLabel || conversionLabel.trim() === '') return;

    // Conversion value reflects the actual first charge: monthly intro A$2,
    // annual A$149. Driven by the billing URL param set on the checkout success URL.
    const billing = searchParams.get("billing");
    const conversionValue = billing === "annual"
      ? PRICING.pro.annual.conversionValue
      : PRICING.pro.monthly.conversionValue;

    // Only mark the dedup flag if the conversion was successfully queued.
    // If the helper returns false (missing env var or SSR), the flag is NOT set
    // so a real paid conversion is not silently lost.
    const fired = trackGoogleAdsConversion(conversionLabel.trim(), conversionValue, 'AUD');

    if (fired) {
      try {
        sessionStorage.setItem(flagKey, "1");
      } catch {
        // sessionStorage write failed - acceptable
      }
    }
  }, [status, alreadyPro, repairedBilling, sessionId, searchParams]);

  const handleRetry = async () => {
    setRetrying(true);
    await syncBilling();
    setRetrying(false);
  };

  return (
    <main className="min-h-[75vh] bg-surface-alt px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xl shadow-accent/10">
          <div className="bg-navy px-6 py-10 text-center text-white sm:px-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 ring-1 ring-white/20">
              {status === "checking" ? (
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
              ) : status === "ready" ? (
                <CheckCircle2 className="h-8 w-8 text-green-300" />
              ) : (
                <Sparkles className="h-8 w-8 text-accent" />
              )}
            </div>
            <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-accent">QuickFill Pro</p>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">You&apos;re Pro now</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-300 sm:text-base">{contextText}</p>
          </div>

          <div className="px-6 py-8 sm:px-10">
            <div
              className={`rounded-xl border px-5 py-4 text-sm font-medium ${
                status === "ready"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : status === "error"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-blue-200 bg-blue-50 text-blue-800"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p>{message}</p>
                {status !== "ready" && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    disabled={retrying || status === "checking"}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-current/20 bg-white/70 px-4 text-sm font-semibold hover:bg-white disabled:opacity-60"
                  >
                    {retrying || status === "checking" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Check again
                  </button>
                )}
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Link
                href="/dashboard?upgraded=true"
                className="flex h-12 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                Go to dashboard
              </Link>
              <Link
                href="/editor?upgraded=true"
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold transition-colors hover:bg-surface-alt"
              >
                <FileText className="h-4 w-4 text-accent" />
                Fill your first Pro PDF
              </Link>
              <Link
                href="/editor?download=ready"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover sm:col-span-2"
              >
                <Download className="h-4 w-4" />
                Download your document
              </Link>
            </div>

            <p className="mt-4 text-center text-xs text-text-muted">
              Tip: press <kbd className="rounded border border-border bg-surface-alt px-1.5 py-0.5 text-xs font-mono">Ctrl+D</kbd> / <kbd className="rounded border border-border bg-surface-alt px-1.5 py-0.5 text-xs font-mono">Cmd+D</kbd> to bookmark QuickFill for next time.
            </p>

            <div className="mt-8 rounded-xl bg-surface-alt p-5 text-sm text-text-muted">
              <p className="font-semibold text-text">What&apos;s unlocked</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Unlimited fills</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> No watermarks</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Saved details</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Priority support</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
