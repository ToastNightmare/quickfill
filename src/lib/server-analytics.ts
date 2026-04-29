import { getRedis } from "@/lib/redis";
import { ANALYTICS_EVENT_SET, type AnalyticsEventName } from "@/lib/analytics-events";

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

const MAX_PROPERTIES = 12;
const DAY_SECONDS = 60 * 60 * 24;

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function cleanValue(value: unknown) {
  if (typeof value === "string") return value.slice(0, 120);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return null;
}

function cleanProperties(input: AnalyticsProperties = {}) {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of Object.entries(input).slice(0, MAX_PROPERTIES)) {
    const key = rawKey.replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, 40);
    if (!key) continue;
    output[key] = cleanValue(rawValue);
  }
  return output;
}

function centsForBilling(billing: unknown) {
  if (billing === "annual") {
    return { firstPeriodCents: 10000, monthlyRunRateCents: 833, annualStarts: 1, monthlyStarts: 0 };
  }
  return { firstPeriodCents: 1200, monthlyRunRateCents: 1200, annualStarts: 0, monthlyStarts: 1 };
}

export async function trackServerEvent(name: AnalyticsEventName, properties: AnalyticsProperties = {}) {
  if (!ANALYTICS_EVENT_SET.has(name)) return;

  const redis = getRedis();
  const day = dayKey();
  const dailyKey = `analytics:${day}`;
  const totalKey = "analytics:total";
  const cleanedProperties = cleanProperties(properties);

  const pipeline = redis.pipeline();
  pipeline.hincrby(dailyKey, name, 1);
  pipeline.expire(dailyKey, DAY_SECONDS * 120);
  pipeline.hincrby(totalKey, name, 1);
  pipeline.lpush("analytics:recent", {
    name,
    properties: cleanedProperties,
    signedIn: true,
    createdAt: new Date().toISOString(),
  });
  pipeline.ltrim("analytics:recent", 0, 499);

  if (name === "subscription_started") {
    const revenue = centsForBilling(cleanedProperties.billing);
    const dailyRevenueKey = `analytics:revenue:${day}`;
    const totalRevenueKey = "analytics:revenue:total";
    pipeline.hincrby(dailyRevenueKey, "paid_conversions", 1);
    pipeline.hincrby(dailyRevenueKey, "annual_starts", revenue.annualStarts);
    pipeline.hincrby(dailyRevenueKey, "monthly_starts", revenue.monthlyStarts);
    pipeline.hincrby(dailyRevenueKey, "first_period_cents", revenue.firstPeriodCents);
    pipeline.hincrby(dailyRevenueKey, "monthly_run_rate_cents", revenue.monthlyRunRateCents);
    pipeline.expire(dailyRevenueKey, DAY_SECONDS * 120);
    pipeline.hincrby(totalRevenueKey, "paid_conversions", 1);
    pipeline.hincrby(totalRevenueKey, "annual_starts", revenue.annualStarts);
    pipeline.hincrby(totalRevenueKey, "monthly_starts", revenue.monthlyStarts);
    pipeline.hincrby(totalRevenueKey, "first_period_cents", revenue.firstPeriodCents);
    pipeline.hincrby(totalRevenueKey, "monthly_run_rate_cents", revenue.monthlyRunRateCents);
  }

  await pipeline.exec();
}
