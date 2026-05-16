"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";

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
    if (syncAlreadyRan) return "Your Pro access is ready.";
    return "Getting your Pro workspace ready...";
  });
  const [retrying, setRetrying] = useState(false);

  const alreadyPro = searchParams.get("alreadyPro") === "true";
  const repairedBilling = searchParams.get("repair") === "true";

  const contextText = useMemo(() => {
    if (alreadyPro) return "You already have an active Pro subscription.";
    if (repairedBilling) return "Your Pro access is being restored.";
    return "Payment received. Your Pro workspace is being prepared.";
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
        setMessage("Your Pro access is ready.");
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
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">You're Pro now</h1>
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
            </div>

            <div className="mt-8 rounded-xl bg-surface-alt p-5 text-sm text-text-muted">
              <p className="font-semibold text-text">What's unlocked</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Unlimited fills</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> No watermarks</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Profile auto-fill</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Priority support</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
