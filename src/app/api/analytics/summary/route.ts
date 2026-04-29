import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { getRedis } from "@/lib/redis";
import { ANALYTICS_EVENTS, type AnalyticsEventName } from "@/lib/analytics-events";

export const runtime = "nodejs";

interface RecentEvent {
  name: AnalyticsEventName;
  properties?: Record<string, string | number | boolean | null>;
  signedIn?: boolean;
  createdAt?: string;
}

interface RevenueSummary {
  paidConversions: number;
  annualStarts: number;
  monthlyStarts: number;
  firstPeriodCents: number;
  monthlyRunRateCents: number;
}

function eventLabel(name: AnalyticsEventName) {
  return name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysBack(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (count - index - 1));
    return dayKey(date);
  });
}

function toNumber(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function sumCounts(rows: Record<string, string | number>[]) {
  const counts = Object.fromEntries(ANALYTICS_EVENTS.map((name) => [name, 0])) as Record<AnalyticsEventName, number>;
  for (const row of rows) {
    for (const name of ANALYTICS_EVENTS) {
      counts[name] += toNumber(row?.[name]);
    }
  }
  return counts;
}

function sumRevenue(rows: Record<string, string | number>[]) {
  return rows.reduce(
    (acc: RevenueSummary, row): RevenueSummary => ({
      paidConversions: acc.paidConversions + toNumber(row?.paid_conversions),
      annualStarts: acc.annualStarts + toNumber(row?.annual_starts),
      monthlyStarts: acc.monthlyStarts + toNumber(row?.monthly_starts),
      firstPeriodCents: acc.firstPeriodCents + toNumber(row?.first_period_cents),
      monthlyRunRateCents: acc.monthlyRunRateCents + toNumber(row?.monthly_run_rate_cents),
    }),
    { paidConversions: 0, annualStarts: 0, monthlyStarts: 0, firstPeriodCents: 0, monthlyRunRateCents: 0 }
  );
}

export async function GET(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get("days") ?? 14);
  const dayCount = [1, 7, 14, 30].includes(requestedDays) ? requestedDays : 14;

  const redis = getRedis();
  const days = daysBack(dayCount);

  const [totalRaw, revenueRaw, recentRaw, ...rawRows] = await Promise.all([
    redis.hgetall<Record<string, string | number>>("analytics:total"),
    redis.hgetall<Record<string, string | number>>("analytics:revenue:total"),
    redis.lrange<RecentEvent>("analytics:recent", 0, 79),
    ...days.flatMap((day) => [
      redis.hgetall<Record<string, string | number>>(`analytics:${day}`),
      redis.hgetall<Record<string, string | number>>(`analytics:revenue:${day}`),
    ]),
  ]);

  const dailyRaw: Record<string, string | number>[] = [];
  const dailyRevenueRaw: Record<string, string | number>[] = [];
  for (let index = 0; index < rawRows.length; index += 2) {
    dailyRaw.push(rawRows[index] ?? {});
    dailyRevenueRaw.push(rawRows[index + 1] ?? {});
  }

  const rangeCounts = sumCounts(dailyRaw);
  const rangeRevenue = sumRevenue(dailyRevenueRaw);
  const totalRevenue = sumRevenue([revenueRaw ?? {}]);

  const totals = ANALYTICS_EVENTS.map((name) => ({
    name,
    label: eventLabel(name),
    count: toNumber(totalRaw?.[name]),
    rangeCount: rangeCounts[name],
  }));

  const daily = days.map((day, index) => {
    const row = dailyRaw[index] ?? {};
    const revenueRow = dailyRevenueRaw[index] ?? {};
    const counts = Object.fromEntries(ANALYTICS_EVENTS.map((name) => [name, toNumber(row[name])])) as Record<AnalyticsEventName, number>;
    return {
      day,
      counts,
      revenue: {
        paidConversions: toNumber(revenueRow.paid_conversions),
        firstPeriodCents: toNumber(revenueRow.first_period_cents),
        monthlyRunRateCents: toNumber(revenueRow.monthly_run_rate_cents),
      },
    };
  });

  const totalDownloads = rangeCounts.download_attempt;
  const successfulDownloads = rangeCounts.download_success;
  const failedDownloads = rangeCounts.download_failed;
  const checkoutStarts = rangeCounts.checkout_start;
  const limitHits = rangeCounts.free_limit_hit;
  const homeClicks = rangeCounts.home_cta_click;
  const uploads = rangeCounts.editor_upload_started;
  const pdfLoaded = rangeCounts.editor_pdf_loaded;
  const paidConversions = rangeCounts.subscription_started;

  const funnel = {
    homeClicks,
    templateStarts: rangeCounts.template_start,
    uploads,
    pdfLoaded,
    fieldAdds: rangeCounts.field_added,
    totalDownloads,
    successfulDownloads,
    failedDownloads,
    limitHits,
    checkoutStarts,
    paidConversions,
    uploadToLoadedRate: uploads > 0 ? Math.round((pdfLoaded / uploads) * 100) : null,
    downloadSuccessRate: totalDownloads > 0 ? Math.round((successfulDownloads / totalDownloads) * 100) : null,
    checkoutFromLimitRate: limitHits > 0 ? Math.round((checkoutStarts / limitHits) * 100) : null,
    paidFromCheckoutRate: checkoutStarts > 0 ? Math.round((paidConversions / checkoutStarts) * 100) : null,
  };

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    days: dayCount,
    totals,
    daily,
    recent: recentRaw ?? [],
    funnel,
    revenue: {
      range: rangeRevenue,
      total: {
        paidConversions: toNumber(revenueRaw?.paid_conversions),
        annualStarts: toNumber(revenueRaw?.annual_starts),
        monthlyStarts: toNumber(revenueRaw?.monthly_starts),
        firstPeriodCents: toNumber(revenueRaw?.first_period_cents),
        monthlyRunRateCents: toNumber(revenueRaw?.monthly_run_rate_cents),
      },
      totalFromRows: totalRevenue,
    },
  });
}
