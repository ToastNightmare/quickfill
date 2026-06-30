"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
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
import InteractiveTimeline from "./InteractiveTimeline";

interface SummaryResponse {
  updatedAt: string;
  rangeStart: string;
  rangeEnd: string;
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
    landingViews: number;
    landingToCtaRate: number | null;
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
  utmBreakdown: {
    source: string;
    medium: string | null;
    campaign: string | null;
    landingViews: number;
    checkoutStarts: number;
    paidConversions: number;
  }[];
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
  landing_page_view: "Landing page views",
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
  upgrade_prompted: "Upgrade prompted",
  checkout_start: "Checkout starts",
  checkout_cancelled: "Checkout cancelled",
  billing_portal_open: "Billing portal opens",
  subscription_started: "Paid conversions",
  subscription_updated: "Subscription updates",
  subscription_cancelled: "Cancellations",
};

const EVENT_ICONS: Record<AnalyticsEventName, typeof MousePointerClick> = {
  landing_page_view: BarChart3,
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
  upgrade_prompted: Sparkles,
  checkout_start: Sparkles,
  checkout_cancelled: Zap,
  billing_portal_open: Zap,
  subscription_started: TrendingUp,
  subscription_updated: TrendingUp,
  subscription_cancelled: Zap,
};

const rangeOptions = [1, 7, 14, 30] as const;

function formatAWST(iso?: string) {
  if (!iso) return "Just now";
  return (
    new Date(iso).toLocaleString("en-AU", {
      timeZone: "Australia/Perth",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " AWST"
  );
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

function progressWidth(value: number | null) {
  if (value === null) return "0%";
  return `${Math.min(Math.max(value, 0), 100)}%`;
}

function insightText(summary: SummaryResponse | null) {
  if (!summary) return [];
  const items: { title: string; body: string; tone: "good" | "warn" | "info" }[] = [];
  const f = summary.funnel;

  if (f.failedDownloads > 0) {
    items.push({
      title: "Fix download failures first",
      body: `${f.failedDownloads} failed download event${f.failedDownloads === 1 ? "" : "s"} in this range. That is the fastest way to protect trust.`,
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

function sourceBadge(source: string): string {
  const s = source.toLowerCase();
  if (s === "meta" || s === "facebook") return "bg-blue-500/20 text-blue-300 border border-blue-500/30";
  if (s === "google")  return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
  if (s === "zeely")   return "bg-purple-500/20 text-purple-300 border border-purple-500/30";
  if (s === "soro")    return "bg-amber-500/20 text-amber-300 border border-amber-500/30";
  if (s === "(direct)") return "bg-slate-600/50 text-slate-300 border border-slate-500/30";
  return "bg-slate-700 text-slate-300 border border-slate-600";
}

function RevenueMetric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-slate-900 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-100">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-600">{note}</p>}
    </div>
  );
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

  const hasActivityData = useMemo(() => {
    return (summary?.daily ?? []).some(
      (d) => d.counts.editor_pdf_loaded + d.counts.download_success + d.counts.checkout_start > 0
    );
  }, [summary]);

  const funnelSteps = useMemo(() => {
    const f = summary?.funnel;
    function pct(num: number, den: number): number | null {
      return den > 0 ? Math.min(Math.max(Math.round((num / den) * 100), 0), 100) : null;
    }
    return [
      { label: "Landing views",    count: f?.landingViews ?? 0,        conv: null },
      { label: "CTA clicks",       count: f?.homeClicks ?? 0,          conv: f?.landingToCtaRate ?? null },
      { label: "Upload starts",    count: f?.uploads ?? 0,             conv: pct(f?.uploads ?? 0, f?.homeClicks ?? 0) },
      { label: "PDF loaded",       count: f?.pdfLoaded ?? 0,           conv: f?.uploadToLoadedRate ?? null },
      { label: "Downloads",        count: f?.successfulDownloads ?? 0, conv: pct(f?.successfulDownloads ?? 0, f?.pdfLoaded ?? 0) },
      { label: "Upgrade prompted", count: f?.limitHits ?? 0,           conv: null },
      { label: "Checkout starts",  count: f?.checkoutStarts ?? 0,      conv: f?.checkoutFromLimitRate ?? null },
      { label: "Paid conversions", count: f?.paidConversions ?? 0,     conv: f?.paidFromCheckoutRate ?? null },
    ];
  }, [summary]);

  const kpis = [
    { name: "landing_page_view" as AnalyticsEventName,   title: "Landing Views",     sub: "Page impressions",      icon: BarChart3,          accent: "blue",   primary: true  },
    { name: "home_cta_click" as AnalyticsEventName,       title: "CTA Clicks",        sub: "Homepage intent",       icon: MousePointerClick,  accent: "blue",   primary: false },
    { name: "editor_upload_started" as AnalyticsEventName,title: "Upload Starts",     sub: "User PDFs selected",    icon: Upload,             accent: "purple", primary: true  },
    { name: "editor_pdf_loaded" as AnalyticsEventName,    title: "PDFs Loaded",       sub: "Editor usable",         icon: FileText,           accent: "purple", primary: false },
    { name: "download_success" as AnalyticsEventName,     title: "Downloads",         sub: "Value delivered",       icon: Download,           accent: "green",  primary: true  },
    { name: "upgrade_prompted" as AnalyticsEventName,     title: "Upgrade Prompted",  sub: "Limit reached",         icon: Sparkles,           accent: "amber",  primary: false },
    { name: "checkout_start" as AnalyticsEventName,       title: "Checkout Starts",   sub: "Revenue intent",        icon: Zap,                accent: "amber",  primary: false },
    { name: "subscription_started" as AnalyticsEventName, title: "Paid Conversions",  sub: "Stripe confirmed",      icon: TrendingUp,         accent: "green",  primary: true  },
  ];

  const accentMap = {
    blue:   { bg: "bg-blue-500/15",   text: "text-blue-400",    border: "border-blue-500/30"   },
    purple: { bg: "bg-purple-500/15", text: "text-purple-400",  border: "border-purple-500/30" },
    green:  { bg: "bg-emerald-500/15",text: "text-emerald-400", border: "border-emerald-500/30"},
    amber:  { bg: "bg-amber-500/15",  text: "text-amber-400",   border: "border-amber-500/30"  },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Section A -- Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Growth Command Centre</h1>
          <p className="mt-1 text-sm text-slate-400">
            Funnel, traffic, and revenue signals for QuickFill.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg bg-slate-800 border border-slate-700/50 p-1 gap-1">
            {(() => {
              const rangeLabelMap: Record<number, string> = {
                1:  "Current analytics day",
                7:  "7 days",
                14: "14 days",
                30: "30 days",
              };
              return rangeOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setDays(option)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${days === option ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700"}`}
                >
                  {rangeLabelMap[option] ?? `${option}d`}
                </button>
              ));
            })()}
          </div>
          <button
            onClick={() => loadSummary(days)}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>
      {summary && (
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-4 py-3 text-xs text-slate-400 space-y-1">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>
              <span className="text-slate-500">Selected range:</span>{" "}
              <span className="text-slate-200 font-medium">{(() => {
                const rangeLabelMap: Record<number, string> = {
                  1:  "Current analytics day",
                  7:  "7 days",
                  14: "14 days",
                  30: "30 days",
                };
                return rangeLabelMap[days] ?? `${days}d`;
              })()}</span>
            </span>
            <span>
              <span className="text-slate-500">From:</span>{" "}
              <span className="text-slate-200">{formatAWST(summary.rangeStart)}</span>
            </span>
            <span>
              <span className="text-slate-500">To:</span>{" "}
              <span className="text-slate-200">{formatAWST(summary.rangeEnd)}</span>
            </span>
            <span>
              <span className="text-slate-500">Updated:</span>{" "}
              <span className="text-slate-200">{formatAWST(summary.updatedAt)}</span>
            </span>
            <span>
              <span className="text-slate-500">Timezone:</span>{" "}
              <span className="text-slate-200">Australia/Perth</span>
            </span>
          </div>
          <p className="text-slate-600 text-[11px]">
            Analytics days use UTC date boundaries, which start at 8:00 AM AWST. Ranges are UTC calendar-day windows, not rolling 24-hour periods.
          </p>
        </div>
      )}

      {/* Section B -- KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.map((item) => {
          const Icon = item.icon;
          const colors = accentMap[item.accent as keyof typeof accentMap];
          const isPrimary = item.primary ?? false;
          const topAccent = isPrimary
            ? item.accent === "blue"   ? "border-t-blue-500"
            : item.accent === "purple" ? "border-t-purple-500"
            : item.accent === "green"  ? "border-t-emerald-500"
            : "border-t-amber-500"
            : "border-t-transparent";
          return (
            <div key={item.name} className={`rounded-xl border border-slate-700/50 p-4 border-t-4 ${isPrimary ? 'bg-slate-800' : 'bg-slate-800/60'} ${topAccent}`}>
              <div className="flex items-center justify-between mb-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors.bg}`}>
                  <Icon className={`h-4 w-4 ${colors.text}`} />
                </div>
                <span className="text-xs font-medium text-slate-500">{days}d</span>
              </div>
              <p className={`${isPrimary ? 'text-3xl font-bold text-slate-100' : 'text-xl font-bold text-slate-300'} tabular-nums`}>
                {loading ? "..." : (totals[item.name] ?? 0)}
              </p>
              <p className={`mt-0.5 text-xs ${isPrimary ? 'font-bold text-slate-200' : 'font-medium text-slate-400'}`}>{item.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{item.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Section C -- Conversion Funnel */}
      <section className="rounded-xl bg-slate-800 border border-slate-700/50 p-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-slate-100" />
          <h2 className="text-lg font-semibold text-slate-100">Conversion Funnel</h2>
        </div>
        <div className="space-y-3 mt-5">
          {funnelSteps.map((step, i) => {
            const barW = funnelSteps[0].count > 0
              ? Math.max(2, Math.round((step.count / funnelSteps[0].count) * 100))
              : 2;
            const barColors = ["bg-blue-500","bg-blue-500","bg-purple-500","bg-purple-500","bg-emerald-500","bg-emerald-500","bg-amber-500","bg-amber-500"];
            const isLowConv = step.conv !== null && step.conv < 30;
            return (
              <div key={step.label}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-300">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-200">{step.label}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-slate-100 tabular-nums">
                      {loading ? "..." : step.count}
                    </span>
                    <span className={`w-16 text-right text-xs tabular-nums font-medium ${isLowConv ? "text-amber-400" : "text-slate-500"}`}>
                      {loading ? "" : step.conv === null ? "—" : `${step.conv}%`}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-900 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full ${barColors[i]} transition-all duration-500`}
                    style={{ width: loading ? "0%" : `${barW}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Conversion % is relative to the previous step. Amber indicates less than 30%.
        </p>
      </section>

      {/* Section D -- Revenue Signal + Funnel Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="rounded-xl bg-slate-800 border border-slate-700/50 border-t-2 border-t-emerald-500/60 p-6 lg:col-span-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-slate-100">Revenue Signal</h2>
          </div>
          <div className="mt-5 mb-5 pb-5 border-b border-slate-700/50">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Est. Monthly Run Rate</p>
            <p className="text-4xl font-bold text-emerald-400 mt-1 tabular-nums">
              {loading ? "..." : money(summary?.revenue.range.monthlyRunRateCents ?? 0)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Subscription-start estimate, {days}-day range</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <RevenueMetric label="Paid Conversions" value={loading ? "..." : String(summary?.revenue.range.paidConversions ?? 0)} />
            <RevenueMetric label="Est. First Period" value={loading ? "..." : money(summary?.revenue.range.firstPeriodCents ?? 0)} />
            <RevenueMetric label="All-time Paid" value={loading ? "..." : String(summary?.revenue.total.paidConversions ?? 0)} />
            <RevenueMetric
              label="Recurring Run-rate (MRR)"
              value={loading ? "..." : money(summary?.revenue.range.monthlyRunRateCents ?? 0)}
              note="estimated run-rate"
            />
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Revenue signal is estimated from subscription-start analytics events using current pricing assumptions. First-period revenue reflects estimated first charges: monthly intro A$2 or annual A$149. Run-rate reflects estimated ongoing monthly value: A$25/month or annual counted as A$149/12. For live Stripe-derived revenue, use the admin revenue view.
          </p>
        </section>

        <section className="rounded-xl bg-slate-800 border border-slate-700/50 p-6">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-slate-100" />
            <h2 className="text-lg font-semibold text-slate-100">Funnel Health</h2>
          </div>
          <div className="mt-5 space-y-4">
            {[
              ["Upload to PDF loaded",    summary?.funnel.uploadToLoadedRate    ?? null],
              ["Download success rate",   summary?.funnel.downloadSuccessRate   ?? null],
              ["Checkout from limit hit", summary?.funnel.checkoutFromLimitRate ?? null],
              ["Paid from checkout",      summary?.funnel.paidFromCheckoutRate  ?? null],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-slate-400 text-xs">{label as string}</span>
                  <span className="font-semibold text-slate-200 text-xs">{rate(value as number | null)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-900">
                  <div className="h-1.5 rounded-full bg-blue-500 transition-all duration-500" style={{ width: progressWidth(value as number | null) }} />
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-lg bg-slate-900 p-3">
                <p className="text-xs text-slate-500">Limit hits</p>
                <p className="mt-1 text-xl font-bold text-slate-100">{summary?.funnel.limitHits ?? 0}</p>
              </div>
              <div className="rounded-lg bg-slate-900 p-3">
                <p className="text-xs text-slate-500">Failed downloads</p>
                <p className="mt-1 text-xl font-bold text-red-400">{summary?.funnel.failedDownloads ?? 0}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Section E -- Activity Chart */}
      <section className="rounded-xl bg-slate-800 border border-slate-700/50 p-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-slate-100" />
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Activity by Day</h2>
            <p className="text-sm text-slate-400">PDF loads, downloads, and checkout starts.</p>
          </div>
        </div>
        {!loading && !hasActivityData ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-700 bg-slate-900/50 px-6 py-8 text-center">
            <BarChart3 className="mx-auto h-8 w-8 text-slate-700 mb-3" />
            <p className="text-sm font-semibold text-slate-400">No activity yet for this range</p>
            <p className="mt-1 text-xs text-slate-600">PDF loads, downloads, and checkout starts will chart here once traffic arrives.</p>
          </div>
        ) : (
          <>
            <div className="mt-6 flex h-48 items-end gap-1">
              {(summary?.daily ?? []).map((day) => {
                const loaded   = day.counts.editor_pdf_loaded;
                const downloads = day.counts.download_success;
                const checkouts = day.counts.checkout_start;
                const combined  = loaded + downloads + checkouts;
                const totalH = Math.max(6, Math.round((combined / maxDaily) * 100));
                const loadedH   = combined > 0 ? Math.round((loaded   / combined) * totalH) : 0;
                const downloadH = combined > 0 ? Math.round((downloads/ combined) * totalH) : 0;
                const checkoutH = combined > 0 ? totalH - loadedH - downloadH : 0;
                return (
                  <div key={day.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div className="flex h-40 w-full flex-col items-stretch justify-end rounded overflow-hidden bg-slate-900">
                      {checkouts > 0 && <div className="w-full bg-amber-500/70" style={{ height: `${checkoutH}%` }} title={`Checkouts: ${checkouts}`} />}
                      {downloads > 0 && <div className="w-full bg-emerald-500/70" style={{ height: `${downloadH}%` }} title={`Downloads: ${downloads}`} />}
                      {loaded > 0    && <div className="w-full bg-blue-500/70"    style={{ height: `${loadedH}%`   }} title={`PDF loads: ${loaded}`} />}
                    </div>
                    <span className="truncate text-[10px] text-slate-600">{day.day.slice(5)}</span>
                  </div>
                );
              })}
              {loading && <div className="h-40 w-full animate-pulse rounded-lg bg-slate-700" />}
            </div>
          </>
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-blue-500/70" />PDF loaded: {totals.editor_pdf_loaded ?? 0}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500/70" />Downloads: {totals.download_success ?? 0}</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-amber-500/70" />Checkouts: {totals.checkout_start ?? 0}</span>
        </div>
      </section>

      {/* Section F -- Traffic Sources */}
      <section className="rounded-xl bg-slate-800 border border-slate-700/50 p-6">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-slate-100" />
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Traffic Sources</h2>
            <p className="text-sm text-slate-400">UTM parameter breakdown from recent events.</p>
          </div>
        </div>
        {summary?.utmBreakdown && summary.utmBreakdown.length > 0 ? (
          <>
            {(() => {
              const maxLandingViews = Math.max(1, ...(summary?.utmBreakdown ?? []).map(r => r.landingViews));
              return (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Source</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Medium</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Campaign</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Landing</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Checkouts</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Paid</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Conv.%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {summary.utmBreakdown.map((row) => {
                        const convRate = row.landingViews > 0
                          ? ((row.checkoutStarts / row.landingViews) * 100).toFixed(1) + "%"
                          : "n/a";
                        const barW = Math.max(4, Math.round((row.landingViews / maxLandingViews) * 100));
                        return (
                          <tr key={`${row.source}-${row.medium ?? ""}-${row.campaign ?? ""}`} className="hover:bg-slate-700/30 transition-colors">
                            <td className="px-3 py-3">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sourceBadge(row.source)}`}>
                                {row.source}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-sm text-slate-400">{row.medium ?? "-"}</td>
                            <td className="px-3 py-3 text-sm text-slate-400">{row.campaign ?? "-"}</td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-sm font-semibold text-slate-100 tabular-nums">{row.landingViews}</span>
                                <div className="h-1 w-16 rounded-full bg-slate-900 overflow-hidden">
                                  <div className="h-1 rounded-full bg-blue-500/60" style={{ width: `${barW}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right text-sm tabular-nums text-slate-300">{row.checkoutStarts}</td>
                            <td className="px-3 py-3 text-right text-sm tabular-nums">
                              <span className={row.paidConversions > 0 ? "text-emerald-400 font-semibold" : "text-slate-400"}>
                                {row.paidConversions}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right text-xs tabular-nums text-slate-400">{convRate}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            <p className="mt-3 text-xs text-slate-500">
              Paid conversions here use the recent events buffer - best-effort attribution only, not exact Stripe data.
            </p>
          </>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-6">
            <p className="text-sm font-semibold text-slate-400 mb-2">No campaign data yet</p>
            <p className="text-xs text-slate-500 mb-4">
              Run traffic through tracked links to populate this panel. Each UTM source will appear as a row with landing views, checkout starts, paid conversions, and conversion rate.
            </p>
            <div className="flex flex-wrap gap-2">
              {["meta / paid", "zeely / paid", "soro / referral", "google / organic", "(direct)"].map((label) => (
                <span key={label} className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-500">
                  {label}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-600">Expected sources once campaigns are live.</p>
          </div>
        )}
      </section>

      {/* Section G -- Recommendations */}
      <section className="rounded-xl bg-slate-800 border border-slate-700/50 p-6">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-slate-100" />
          <h2 className="text-lg font-semibold text-slate-100">Recommendations</h2>
        </div>
        <div className="mt-5 grid gap-3">
          {insightText(summary).map((item) => (
            <div
              key={item.title}
              className={`rounded-r-lg border-l-4 p-4 ${
                item.tone === "warn" ? "border-l-amber-500 bg-slate-900"
                : item.tone === "good" ? "border-l-emerald-500 bg-slate-900"
                : "border-l-blue-500 bg-slate-900"
              }`}
            >
              <p className="text-sm font-semibold text-slate-100">{item.title}</p>
              <p className="mt-1 text-sm text-slate-400">{item.body}</p>
            </div>
          ))}
        </div>
        {!loading && summary && insightText(summary).length === 1 && insightText(summary)[0].title === "Need more signal" && (
          <div className="mt-3 grid gap-2">
            {[
              { icon: "arrow", text: "Watch checkout starts vs paid conversions -- that gap is your first revenue signal." },
              { icon: "arrow", text: "Track which campaign produces uploads, not just clicks. Uploads mean intent." },
              { icon: "arrow", text: "Traffic source data will appear after the first UTM-tagged visit arrives." },
              { icon: "arrow", text: "Aim for upload-to-download rate above 60% before scaling paid spend." },
            ].map((tip) => (
              <div key={tip.text} className="flex items-start gap-2 rounded-lg bg-slate-900 px-4 py-3">
                <span className="mt-0.5 text-slate-600 text-xs">-</span>
                <p className="text-xs text-slate-500">{tip.text}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section H -- Recent Events */}
      <section className="rounded-xl bg-slate-800 border border-slate-700/50 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Recent events</h2>
          <p className="text-xs text-slate-500">
            Updated {summary ? formatAWST(summary.updatedAt) : "..."}
          </p>
        </div>
        <div className="mt-5 divide-y divide-slate-700/50">
          {(summary?.recent ?? []).slice(0, 30).map((event, index) => {
            const Icon = EVENT_ICONS[event.name] ?? MousePointerClick;
            const properties = Object.entries(event.properties ?? {}).filter(([, value]) => value !== null && value !== "");
            return (
              <div key={index} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-700">
                    <Icon className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{EVENT_LABELS[event.name]}</p>
                    <p className="text-xs text-slate-500">{formatAWST(event.createdAt)} {event.signedIn ? "signed in" : "guest"}</p>
                  </div>
                </div>
                {properties.length > 0 && (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {properties.slice(0, 5).map(([key, value]) => (
                      <span key={key} className="rounded-full bg-slate-900 px-2.5 py-1 text-xs text-slate-400">
                        {key}: {formatProperty(value)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && (summary?.recent.length ?? 0) === 0 && (
            <div className="py-10 text-center">
              <Activity className="mx-auto h-8 w-8 text-slate-700 mb-3" />
              <p className="text-sm font-semibold text-slate-400">No events recorded yet</p>
              <p className="mt-1 text-xs text-slate-600">
                Events appear here as users visit the landing page, upload PDFs, and complete downloads.
              </p>
            </div>
          )}
        </div>
      </section>

      <InteractiveTimeline events={summary?.recent ?? []} loading={loading} />
    </div>
  );
}
