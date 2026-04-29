"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Download,
  FileText,
  Gauge,
  MousePointerClick,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

type EventName =
  | "home_cta_click"
  | "template_start"
  | "download_attempt"
  | "download_success"
  | "download_failed"
  | "free_limit_hit"
  | "checkout_start";

interface SummaryResponse {
  updatedAt: string;
  totals: { name: EventName; label: string; count: number }[];
  daily: { day: string; counts: Record<EventName, number> }[];
  recent: {
    name: EventName;
    properties?: Record<string, string | number | boolean | null>;
    signedIn?: boolean;
    createdAt?: string;
  }[];
  funnel: {
    homeClicks: number;
    templateStarts: number;
    totalDownloads: number;
    successfulDownloads: number;
    failedDownloads: number;
    limitHits: number;
    checkoutStarts: number;
    downloadSuccessRate: number | null;
    checkoutFromLimitRate: number | null;
  };
}

const EVENT_LABELS: Record<EventName, string> = {
  home_cta_click: "Home CTA",
  template_start: "Template starts",
  download_attempt: "Download attempts",
  download_success: "Successful downloads",
  download_failed: "Failed downloads",
  free_limit_hit: "Limit hits",
  checkout_start: "Checkout starts",
};

const EVENT_ICONS: Record<EventName, typeof MousePointerClick> = {
  home_cta_click: MousePointerClick,
  template_start: FileText,
  download_attempt: Download,
  download_success: CheckCircle2,
  download_failed: Zap,
  free_limit_hit: Gauge,
  checkout_start: Sparkles,
};

function formatDate(value?: string) {
  if (!value) return "Just now";
  return new Date(value).toLocaleString("en-AU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatProperty(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

export default function AnalyticsDashboardPage() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/summary", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load analytics");
      setSummary(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "Analytics | QuickFill";
    loadSummary();
  }, []);

  const totals = useMemo(() => {
    return Object.fromEntries((summary?.totals ?? []).map((item) => [item.name, item.count])) as Partial<Record<EventName, number>>;
  }, [summary]);

  const maxDaily = useMemo(() => {
    if (!summary) return 1;
    return Math.max(
      1,
      ...summary.daily.map((day) => day.counts.home_cta_click + day.counts.template_start + day.counts.download_success)
    );
  }, [summary]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-surface-alt">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <h1 className="mt-4 text-3xl font-bold tracking-tight">Growth analytics</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-muted">
              A quick read on the path from homepage interest to PDF download and checkout intent.
            </p>
          </div>
          <button
            onClick={loadSummary}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-white disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["home_cta_click", "Homepage interest"],
            ["template_start", "Template demand"],
            ["download_success", "Completed value"],
            ["checkout_start", "Revenue intent"],
          ] as [EventName, string][]).map(([name, title]) => {
            const Icon = EVENT_ICONS[name];
            return (
              <div key={name} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                    <Icon className="h-5 w-5 text-accent" />
                  </div>
                  <span className="text-xs font-medium text-text-muted">{EVENT_LABELS[name]}</span>
                </div>
                <p className="mt-5 text-3xl font-bold">{loading ? "..." : totals[name] ?? 0}</p>
                <p className="mt-1 text-sm text-text-muted">{title}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">14-day activity</h2>
                <p className="mt-1 text-sm text-text-muted">Home clicks, template starts, and successful downloads.</p>
              </div>
              <BarChart3 className="h-5 w-5 text-accent" />
            </div>
            <div className="mt-8 flex h-56 items-end gap-2">
              {(summary?.daily ?? []).map((day) => {
                const combined = day.counts.home_cta_click + day.counts.template_start + day.counts.download_success;
                const height = Math.max(6, Math.round((combined / maxDaily) * 100));
                return (
                  <div key={day.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-44 w-full items-end rounded bg-surface-alt">
                      <div
                        className="w-full rounded bg-accent"
                        style={{ height: `${height}%` }}
                        title={`${day.day}: ${combined} events`}
                      />
                    </div>
                    <span className="truncate text-[10px] text-text-muted">{day.day.slice(5)}</span>
                  </div>
                );
              })}
              {loading && <div className="h-44 w-full animate-pulse rounded-lg bg-surface-alt" />}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold">Funnel health</h2>
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Download success rate</span>
                  <span className="font-semibold">{summary?.funnel.downloadSuccessRate ?? 0}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-surface-alt">
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${summary?.funnel.downloadSuccessRate ?? 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Checkout from limit hit</span>
                  <span className="font-semibold">{summary?.funnel.checkoutFromLimitRate ?? 0}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-surface-alt">
                  <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${summary?.funnel.checkoutFromLimitRate ?? 0}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-lg bg-surface-alt p-3">
                  <p className="text-xs text-text-muted">Limit hits</p>
                  <p className="mt-1 text-xl font-bold">{summary?.funnel.limitHits ?? 0}</p>
                </div>
                <div className="rounded-lg bg-surface-alt p-3">
                  <p className="text-xs text-text-muted">Failed downloads</p>
                  <p className="mt-1 text-xl font-bold">{summary?.funnel.failedDownloads ?? 0}</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-lg border border-border bg-surface p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent events</h2>
            <p className="text-xs text-text-muted">
              Updated {summary ? formatDate(summary.updatedAt) : "..."}
            </p>
          </div>
          <div className="mt-5 divide-y divide-border">
            {(summary?.recent ?? []).slice(0, 20).map((event, index) => {
              const Icon = EVENT_ICONS[event.name] ?? MousePointerClick;
              const properties = Object.entries(event.properties ?? {}).filter(([, value]) => value !== null && value !== "");
              return (
                <div key={index} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
                      <Icon className="h-4 w-4 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{EVENT_LABELS[event.name]}</p>
                      <p className="text-xs text-text-muted">{formatDate(event.createdAt)} {event.signedIn ? "signed in" : "guest"}</p>
                    </div>
                  </div>
                  {properties.length > 0 && (
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {properties.slice(0, 4).map(([key, value]) => (
                        <span key={key} className="rounded-full bg-surface-alt px-2.5 py-1 text-xs text-text-muted">
                          {key}: {formatProperty(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && (summary?.recent.length ?? 0) === 0 && (
              <p className="py-8 text-center text-sm text-text-muted">No analytics events yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
