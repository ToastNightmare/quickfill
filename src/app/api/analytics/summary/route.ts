import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";

const EVENTS = [
  "home_cta_click",
  "template_start",
  "download_attempt",
  "download_success",
  "download_failed",
  "free_limit_hit",
  "checkout_start",
] as const;

type EventName = (typeof EVENTS)[number];

interface RecentEvent {
  name: EventName;
  properties?: Record<string, string | number | boolean | null>;
  signedIn?: boolean;
  createdAt?: string;
}

function eventLabel(name: EventName) {
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

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedis();
  const days = daysBack(14);

  const [totalRaw, recentRaw, ...dailyRaw] = await Promise.all([
    redis.hgetall<Record<string, string | number>>("analytics:total"),
    redis.lrange<RecentEvent>("analytics:recent", 0, 49),
    ...days.map((day) => redis.hgetall<Record<string, string | number>>(`analytics:${day}`)),
  ]);

  const totals = EVENTS.map((name) => ({
    name,
    label: eventLabel(name),
    count: toNumber(totalRaw?.[name]),
  }));

  const daily = days.map((day, index) => {
    const row = dailyRaw[index] ?? {};
    const counts = Object.fromEntries(EVENTS.map((name) => [name, toNumber(row[name])]));
    return { day, counts };
  });

  const totalDownloads = toNumber(totalRaw?.download_attempt);
  const successfulDownloads = toNumber(totalRaw?.download_success);
  const failedDownloads = toNumber(totalRaw?.download_failed);
  const checkoutStarts = toNumber(totalRaw?.checkout_start);
  const limitHits = toNumber(totalRaw?.free_limit_hit);
  const templateStarts = toNumber(totalRaw?.template_start);
  const homeClicks = toNumber(totalRaw?.home_cta_click);

  const funnel = {
    homeClicks,
    templateStarts,
    totalDownloads,
    successfulDownloads,
    failedDownloads,
    limitHits,
    checkoutStarts,
    downloadSuccessRate:
      totalDownloads > 0 ? Math.round((successfulDownloads / totalDownloads) * 100) : null,
    checkoutFromLimitRate:
      limitHits > 0 ? Math.round((checkoutStarts / limitHits) * 100) : null,
  };

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    totals,
    daily,
    recent: recentRaw ?? [],
    funnel,
  });
}
