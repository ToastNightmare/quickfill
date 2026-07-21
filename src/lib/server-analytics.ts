import { getRedis } from "@/lib/redis";
import { ANALYTICS_EVENT_SET, type AnalyticsEventName } from "@/lib/analytics-events";
import { log } from "@/lib/log";
import { PRICING } from "@/lib/pricing";

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

const MAX_PROPERTIES = 12;
const DAY_SECONDS = 60 * 60 * 24;
const ANALYTICS_TIMEOUT_MS = 1_000;
const BASE_COMMAND_COUNT = 5;
const SUBSCRIPTION_STARTED_COMMAND_COUNT = 11;

type AnalyticsFailurePhase =
  | "redis_setup"
  | "pipeline_build"
  | "pipeline_exec"
  | "result_invalid"
  | "timeout";

type PipelineOutcome =
  | { status: "resolved"; result: unknown }
  | { status: "rejected" }
  | { status: "timeout" };

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
  const monthlyFirstPeriodCents = Math.round(PRICING.pro.monthly.conversionValue * 100);
  const monthlyRunRateCents = Math.round(PRICING.pro.monthly.amount * 100);
  const annualFirstPeriodCents = Math.round(PRICING.pro.annual.amount * 100);
  const annualMonthlyRunRateCents = Math.round(annualFirstPeriodCents / 12);

  if (billing === "annual") {
    return {
      firstPeriodCents: annualFirstPeriodCents,
      monthlyRunRateCents: annualMonthlyRunRateCents,
      annualStarts: 1,
      monthlyStarts: 0,
    };
  }
  return {
    firstPeriodCents: monthlyFirstPeriodCents,
    monthlyRunRateCents,
    annualStarts: 0,
    monthlyStarts: 1,
  };
}

function warnAnalyticsFailure(phase: AnalyticsFailurePhase) {
  try {
    log.warn("server_analytics_failed", { phase });
  } catch {
    // Analytics warnings must not affect the billing request that triggered them.
  }
}

async function executePipeline(pipeline: ReturnType<ReturnType<typeof getRedis>["pipeline"]>): Promise<PipelineOutcome> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const settledExec = Promise.resolve()
    .then(() => pipeline.exec({ keepErrors: true }) as Promise<unknown>)
    .then(
      (result): PipelineOutcome => ({ status: "resolved", result }),
      (): PipelineOutcome => ({ status: "rejected" }),
    );
  const timeout = new Promise<PipelineOutcome>((resolve) => {
    timeoutId = setTimeout(() => resolve({ status: "timeout" }), ANALYTICS_TIMEOUT_MS);
  });

  const outcome = await Promise.race([settledExec, timeout]);
  if (timeoutId !== undefined) clearTimeout(timeoutId);
  return outcome;
}

function isCompletePipelineResult(result: unknown, expectedCount: number) {
  if (!Array.isArray(result) || result.length !== expectedCount) return false;

  return result.every((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    if (!Object.prototype.hasOwnProperty.call(entry, "result")) return false;
    return (entry as { error?: unknown }).error === undefined;
  });
}

export async function trackServerEvent(
  name: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): Promise<boolean> {
  let phase: AnalyticsFailurePhase = "pipeline_build";

  try {
    if (!ANALYTICS_EVENT_SET.has(name)) return false;

    const day = dayKey();
    const dailyKey = `analytics:${day}`;
    const totalKey = "analytics:total";
    const cleanedProperties = cleanProperties(properties);
    const revenue = name === "subscription_started" ? centsForBilling(cleanedProperties.billing) : null;

    phase = "redis_setup";
    const redis = getRedis();

    phase = "pipeline_build";
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

    if (revenue) {
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

    phase = "pipeline_exec";
    const outcome = await executePipeline(pipeline);
    if (outcome.status === "timeout") {
      warnAnalyticsFailure("timeout");
      return false;
    }
    if (outcome.status === "rejected") {
      warnAnalyticsFailure("pipeline_exec");
      return false;
    }

    phase = "result_invalid";
    const expectedCount = BASE_COMMAND_COUNT + (revenue ? SUBSCRIPTION_STARTED_COMMAND_COUNT : 0);
    if (!isCompletePipelineResult(outcome.result, expectedCount)) {
      warnAnalyticsFailure("result_invalid");
      return false;
    }

    return true;
  } catch {
    warnAnalyticsFailure(phase);
    return false;
  }
}
