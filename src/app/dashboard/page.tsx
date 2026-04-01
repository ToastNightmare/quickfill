"use client";

import { useUser } from "@clerk/nextjs";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileText, Sparkles, ExternalLink, Lock, Clock, User } from "lucide-react";

interface UsageData {
  used: number;
  limit: number;
  isPro: boolean;
  tier?: string;
}

interface FillEntry {
  filename: string;
  filledAt: string;
  fieldCount: number;
  pageCount: number;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const upgraded = searchParams.get("upgraded");

  const [usage, setUsage] = useState<UsageData | null>(null);
  const [fills, setFills] = useState<FillEntry[]>([]);

  useEffect(() => {
    fetch("/api/usage").then((r) => r.json()).then(setUsage);
    fetch("/api/fills").then((r) => r.json()).then((data) => {
      if (data && data.fills) setFills(data.fills);
    });
  }, []);

  const handleUpgrade = async () => {
    const res = await fetch("/api/stripe/checkout", { method: "POST" });
    const { url } = await res.json();
    if (url) window.location.href = url;
  };

  const handleManageBilling = async () => {
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const { url } = await res.json();
    if (url) window.location.href = url;
  };

  const tier = usage?.tier ?? "free";
  const isPaid = tier === "pro" || tier === "business";
  const usedPct = usage && !isPaid ? Math.min(100, (usage.used / usage.limit) * 100) : 0;
  const visibleFills = isPaid ? fills : fills.slice(0, 3);
  const lockedFills = isPaid ? [] : fills.slice(3);

  const tierLabel = tier === "business" ? "Business Plan" : tier === "pro" ? "Pro Plan" : "Free Plan";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">
            Welcome back, {user?.firstName ?? "there"}
          </h1>
          <p className="mt-1 text-text-muted">Manage your usage and fill history.</p>
        </div>
        {/* Plan badge */}
        {usage && (
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
            isPaid
              ? "bg-accent/10 text-accent"
              : "bg-surface-alt text-text-muted"
          }`}>
            {isPaid ? <Sparkles className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            {tierLabel}
          </div>
        )}
      </div>

      {upgraded && (
        <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-accent font-medium">
          <Sparkles className="mr-2 inline h-4 w-4" />
          You&apos;ve upgraded! Enjoy your new plan.
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Usage card */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Usage This Month</h2>
          {usage ? (
            <>
              <p className="mt-2 text-sm text-text-muted">
                {tier === "pro" ? (
                  "Unlimited fills  -  Pro plan active"
                ) : tier === "business" ? (
                  <>{usage.used} of {usage.limit} fills used  -  Business plan</>
                ) : (
                  <>{usage.used} of {usage.limit} free fills used</>
                )}
              </p>
              {!isPaid && (
                <>
                  <div className="mt-3 h-2 rounded-full bg-surface-alt overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                  <button
                    onClick={handleUpgrade}
                    className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
                  >
                    <Sparkles className="h-4 w-4" />
                    Upgrade to Pro  -  $12/mo
                  </button>
                </>
              )}
              {tier === "business" && (
                <>
                  <div className="mt-3 h-2 rounded-full bg-surface-alt overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
                    />
                  </div>
                  <button
                    onClick={handleManageBilling}
                    className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold hover:bg-surface-alt transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Manage Billing
                  </button>
                </>
              )}
              {tier === "pro" && (
                <button
                  onClick={handleManageBilling}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold hover:bg-surface-alt transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Manage Billing
                </button>
              )}
            </>
          ) : (
            <div className="mt-4 h-8 animate-pulse rounded bg-surface-alt" />
          )}
        </div>

        {/* Recent fills */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Recent Fills</h2>
          {fills.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-10 w-10 text-text-muted/40" />
              <p className="mt-3 text-sm text-text-muted">
                Your filled documents will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {visibleFills.map((fill, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <FileText className="h-5 w-5 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{fill.filename}</p>
                    <p className="text-xs text-text-muted">
                      {fill.fieldCount} fields &middot; {fill.pageCount} page{fill.pageCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-text-muted whitespace-nowrap">
                    <Clock className="h-3 w-3" />
                    {new Date(fill.filledAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
              {lockedFills.length > 0 && (
                <>
                  {lockedFills.map((fill, i) => (
                    <div key={`locked-${i}`} className="relative flex items-center gap-3 rounded-lg border border-border p-3 opacity-40 select-none blur-[2px]">
                      <FileText className="h-5 w-5 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{fill.filename}</p>
                        <p className="text-xs text-text-muted">
                          {fill.fieldCount} fields
                        </p>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={handleUpgrade}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm font-medium text-accent hover:bg-accent/10 transition-colors"
                  >
                    <Lock className="h-4 w-4" />
                    Upgrade to Pro to see full history
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/profile"
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
            <User className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold">Auto-fill Profile</p>
            <p className="text-xs text-text-muted">Save your details for quick form filling</p>
          </div>
        </Link>
        <Link
          href="/editor"
          className="flex items-center gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
            <FileText className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold">Open Editor</p>
            <p className="text-xs text-text-muted">Upload and fill a new PDF form</p>
          </div>
        </Link>
      </div>

      {/* Upgrade banner for free users */}
      {usage && !isPaid && (
        <div className="mt-6 rounded-xl bg-navy p-6 text-white">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Unlock unlimited fills</h3>
              <p className="mt-1 text-sm text-gray-300">
                Upgrade to Pro for $12/month and never hit a limit. No watermarks on downloads.
              </p>
            </div>
            <button
              onClick={handleUpgrade}
              className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              Upgrade Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
