"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
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
  Upload,
  Zap,
} from "lucide-react";
import type { AnalyticsEventName } from "@/lib/analytics-events";

interface SummaryResponse {
  updatedAt: string;
  days: number;
  totals: { name: AnalyticsEventName; label: string; count: number; rangeCount: number }[];
  daily: {
    day: string;
    counts: Record<AnalyticsEventName, number>;
    revenue: {
      paidConversions: number;
      firstPeriodCents: number;
      monthlyRunRateCents: number;
    };
  }[];
  recent: {
    name: AnalyticsEventName;
    properties?: Record<string, string | number | boolean | null>;
    signedIn?: boolean;
    createdAt?: string;
  }[];
  funnel: {
    homeClicks: number;
    templateStarts: number;
    uploads: number;
    pdfLoaded: number;
    fieldAdds: number;
    totalDownloads: number;
    successfulDownloads: number;
    failedDownloads: number;
    limitHits: number;
    checkoutStarts: number;
    paidConversions: number;
    uploadToLoadedRate: number | null;
    downloadSuccessRate: number | null;
    checkoutFromLimitRate: number | null;
    paidFromCheckoutRate: number | null;
  };
  revenue: {
    range: {
      paidConversions: number;
      annualStarts: number;
      monthlyStarts: number;
      firstPeriodCents: number;
      monthlyRunRateCents: number;
    };
    total: {
      paidConversions: number;
      annualStarts: number;
      monthlyStarts: number;
      firstPeriodCents: number;
      monthlyRunRateCents: number;
    };
  };
}

const EVENT_LABELS: Record<AnalyticsEventName, string> = {
  home_cta_click: "Home CTA",
  template_start: "Template starts",
  editor_upload_started: "Upload starts",
  editor_pdf_loaded: "PDF loaded",
  field_added: "Fields added",
  field_detection_used: "Auto-detect used",
  profile_autofill_used: "Profile auto-fill",
  download_attempt: "Download attempts",
  download_success: "Successful downloads",
  download_failed: "Failed downloads",
  free_limit_hit: "Limit hits",
  checkout_start: "Checkout starts",
  subscription_started: "Paid conversions",
  subscription_cancelled: "Cancellations",
};

const EVENT_ICONS: Record<AnalyticsEventName, typeof MousePointerClick> = {
  home_cta_click: MousePointerClick,
  template_start: FileText,
  editor_upload_started: Upload,
  editor_pdf_loaded: FileText,
  field_added: Activity,
  field_detection_used: Sparkles,
  profile_autofill_used: CheckCircle2,
  download_attempt: Download,
  download_success: CheckCircle2,
  download_failed: AlertTriangle,
  free_limit_hit: Gauge,
  checkout_start: Sparkles,
  subscription_started: TrendingUp,
  subscription_cancelled: Zap,
};

const rangeOptions = [1, 7, 14, 30] as const;

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

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function rate(value: number | null) {
  return value === null ? "n/a" : `${value}%`;
}

function insightText(summary: SummaryResponse | null) {
  if (!summary) return [];
  const items: { title: string; body: string; tone: "good" | "warn" | "info" }[] = [];
  const f = summary.funnel;

  if (f.failedDownloads > 0) {
    items.push({
      title: "Fix download failures first",
      body: `${f.failedDownloads} failed download event${f.failedDownloads === 1 ? "" : "s"} in this range. That is the fastest place to protect trust.`,
      tone: "warn",
    });
  }
  if (f.pdfLoaded > 0 && f.successfulDownloads === 0) {
    items.push({
      title: "Users are not reaching value yet",
      body: "PDFs are loading, but downloads are not happening. Watch the editor flow and CTA clarity.",
      tone: "warn",
    });
  }
  if (f.limitHits > 0 && f.checkoutStarts === 0) {
    items.push({
      title: "Free limit is not selling Pro yet",
      body: "People are hitting the limit, but not starting checkout. The upgrade message likely needs stronger value.",
      tone: "warn",
    });
  }
  if (f.checkoutStarts > 0 && f.paidConversions === 0) {
    items.push({
      title: "Checkout intent needs follow-up",
      body: "People are starting checkout but no paid conversion is recorded in this range.",
      tone: "info",
    });
  }
  if (f.successfulDownloads > 0 && f.failedDownloads === 0) {
    items.push({
      title: "Core product flow is healthy",
      body: "Successful downloads are happening without failed download events in this range.",
      tone: "good",
    });
  }

  if (items.length === 0) {
    items.push({
      title: "Need more signal",
      body: "Keep sending traffic. The dashboard is ready to show where users get stuck once volume picks up.",
      tone: "info",
    });
  }
  return items.slice(0, 3);
}

export default function AdminAnalyticsClient() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<(typeof rangeOptions)[number]>(14);

  const loadSummary = async (selectedDays = days) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/summary?days=${selectedDays}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load analytics");
      setSummary(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "Admin Analytics | QuickFill";
  }, []);

  useEffect(() => {
    loadSummary(days);
  }, [days]);

  const totals = useMemo(() => {
    return Object.fromEntries((summary?.totals ?? []).map((item) => [item.name, item.rangeCount])) as Partial<Record<AnalyticsEventName, number>>;
  }, [summary]);

  const maxDaily = useMemo(() => {
    if (!summary) return 1;
    return Math.max(
      1,
      ...summary.daily.map((day) => day.counts.editor_pdf_loaded + day.counts.download_success + day.counts.checkout_start)
    );
  }, [summary]);

  const kpis = [
    { name: "home_cta_click" as AnalyticsEventName, title: "Visitors showed intent", value: totals.home_cta_click ?? 0, sub: "Homepage CTA clicks", icon: MousePointerClick },
    { name: "editor_upload_started" as AnalyticsEventName, title: "Upload starts", value: totals.editor_upload_started ?? 0, sub: "User PDFs selected", icon: Upload },
    { name: "editor_pdf_loaded" as AnalyticsEventName, title: "PDFs loaded", value: totals.editor_pdf_loaded ?? 0, sub: "Editor became usable", icon: FileText },
    { name: "download_success" as AnalyticsEventName, title: "Downloads", value: totals.download_success ?? 0, sub: "Completed value", icon: Download },
    { name: "checkout_start" as AnalyticsEventName, title: "Checkouts", value: totals.checkout_start ?? 0, sub: "Revenue intent", icon: Sparkles },
    { name: "subscription_started" as AnalyticsEventName, title: "Paid conversions", value: totals.subscription_started ?? 0, sub: "Stripe confirmed", icon: TrendingUp },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-surface-alt">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text">
              <ArrowLeft className="h-4 w-4" />
              Admin
            </Link>
            <h1 className="mt-4 text-3xl font-bold tracking-tight">Growth analytics</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-muted">
              Funnel, revenue, and product quality signals for growing QuickFill.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid grid-cols-4 rounded-lg border border-border bg-surface p-1">
              {rangeOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setDays(option)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${days === option ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
                >
                  {option}d
                </button>
              ))}
            </div>
            <button
              onClick={() => loadSummary(days)}
              disabled={loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold hover:bg-white disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {kpis.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.name} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                    <Icon className="h-5 w-5 text-accent" />
                  </div>
                  <span className="text-xs font-medium text-text-muted">{summary?.days ?? days} days</span>
                </div>
                <p className="mt-5 text-3xl font-bold">{loading ? "..." : item.value}</p>
                <p className="mt-1 text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-text-muted">{item.sub}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Activity by day</h2>
                <p className="mt-1 text-sm text-text-muted">PDF loads, successful downloads, and checkout starts.</p>
              </div>
              <BarChart3 className="h-5 w-5 text-accent" />
            </div>
            <div className="mt-8 flex h-56 items-end gap-2">
              {(summary?.daily ?? []).map((day) => {
                const loaded = day.counts.editor_pdf_loaded;
                const downloads = day.counts.download_success;
                const checkouts = day.counts.checkout_start;
                const combined = loaded + downloads + checkouts;
                const height = Math.max(6, Math.round((combined / maxDaily) * 100));
                return (
                  <div key={day.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-44 w-full items-end rounded bg-surface-alt">
                      <div
                        className="w-full rounded bg-accent"
                        style={{ height: `${height}%` }}
                        title={`${day.day}: ${combined} tracked events`}
                      />
                    </div>
                    <span className="truncate text-[10px] text-text-muted">{day.day.slice(5)}</span>
                  </div>
                );
              })}
              {loading && <div className="h-44 w-full animate-pulse rounded-lg bg-surface-alt" />}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-text-muted">
              <span>PDF loaded: {totals.editor_pdf_loaded ?? 0}</span>
              <span>Downloads: {totals.download_success ?? 0}</span>
              <span>Checkouts: {totals.checkout_start ?? 0}</span>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold">Funnel health</h2>
            </div>
            <div className="mt-5 space-y-4">
              {[
                ["Upload to PDF loaded", summary?.funnel.uploadToLoadedRate ?? null],
                ["Download success rate", summary?.funnel.downloadSuccessRate ?? null],
                ["Checkout from limit hit", summary?.funnel.checkoutFromLimitRate ?? null],
                ["Paid from checkout", summary?.funnel.paidFromCheckoutRate ?? null],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">{label as string}</span>
                    <span className="font-semibold">{rate(value as number | null)}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-surface-alt">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${value ?? 0}%` }} />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Metric label="Limit hits" value={summary?.funnel.limitHits ?? 0} />
                <Metric label="Failed downloads" value={summary?.funnel.failedDownloads ?? 0} />
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold">Revenue signal</h2>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Metric label="Paid conversions" value={summary?.revenue.range.paidConversions ?? 0} />
              <Metric label="Est. first period" value={money(summary?.revenue.range.firstPeriodCents ?? 0)} />
              <Metric label="Est. monthly run rate" value={money(summary?.revenue.range.monthlyRunRateCents ?? 0)} />
              <Metric label="All-time paid conversions" value={summary?.revenue.total.paidConversions ?? 0} />
            </div>
            <p className="mt-4 text-xs text-text-muted">
              Revenue uses Stripe webhook confirmations. Annual plans count as A$100 first period and A$8.33 monthly run rate.
            </p>
          </section>

          <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold">Recommendations</h2>
            </div>
            <div className="mt-5 grid gap-3">
              {insightText(summary).map((item) => (
                <div
                  key={item.title}
                  className={`rounded-lg border p-4 ${item.tone === "warn" ? "border-amber-200 bg-amber-50" : item.tone === "good" ? "border-emerald-200 bg-emerald-50" : "border-border bg-surface-alt"}`}
                >
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-text-muted">{item.body}</p>
                </div>
              ))}
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
            {(summary?.recent ?? []).slice(0, 30).map((event, index) => {
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
                      {properties.slice(0, 5).map(([key, value]) => (
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-surface-alt p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
