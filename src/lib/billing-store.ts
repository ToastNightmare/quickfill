import type Stripe from "stripe";
import { isDatabaseConfigured, query } from "@/lib/db";
import { getRedis, isRedisConfigured } from "@/lib/redis";

export type QuickFillTier = "free" | "pro" | "business";

type StoredSubscriptionStatus = Stripe.Subscription.Status | "active" | "canceled" | "unknown";

type PeriodEndValue = Date | number | string | null | undefined;

const ENTITLED_STATUSES = new Set<string>(["active", "trialing"]);

function periodEndToTime(value: PeriodEndValue) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value * 1000;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function isSubscriptionEntitled(status: StoredSubscriptionStatus | string, currentPeriodEnd?: PeriodEndValue) {
  if (!ENTITLED_STATUSES.has(status)) return false;

  const periodEnd = periodEndToTime(currentPeriodEnd);
  if (periodEnd === null) return true;

  return periodEnd > Date.now();
}

export function tierFromPriceId(priceId?: string | null): QuickFillTier | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) return "pro";
  if (priceId === process.env.STRIPE_BUSINESS_PRICE_ID) return "business";
  if (priceId === process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID) return "business";
  return null;
}

export async function claimStripeEvent(eventId: string, eventType: string) {
  if (!isDatabaseConfigured()) return true;

  try {
    await query(
      "insert into stripe_events (stripe_event_id, event_type, processed_at) values ($1, $2, now())",
      [eventId, eventType],
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("duplicate") || message.includes("unique")) return false;
    throw error;
  }
}

export async function saveSubscriptionSnapshot(input: {
  userId: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  tier: QuickFillTier;
  status: StoredSubscriptionStatus;
  currentPeriodEnd?: number | null;
}) {
  if (isRedisConfigured()) {
    const redis = getRedis();
    if (isSubscriptionEntitled(input.status, input.currentPeriodEnd)) {
      await redis.set(`sub:${input.userId}`, input.tier);
    } else {
      await redis.del(`sub:${input.userId}`);
    }
    if (input.customerId) {
      await redis.set(`stripe_customer:${input.userId}`, input.customerId);
      await redis.set(`stripe_customer_user:${input.customerId}`, input.userId);
    }
  }

  if (!isDatabaseConfigured()) return;

  await query(
    `insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id, tier, status, current_period_end, updated_at)
     values ($1, $2, $3, $4, $5, to_timestamp($6::double precision), now())
     on conflict (user_id) do update set
       stripe_customer_id = excluded.stripe_customer_id,
       stripe_subscription_id = excluded.stripe_subscription_id,
       tier = excluded.tier,
       status = excluded.status,
       current_period_end = excluded.current_period_end,
       updated_at = now()`,
    [input.userId, input.customerId ?? null, input.subscriptionId ?? null, input.tier, input.status, input.currentPeriodEnd ?? null],
  );
}

export async function getStoredTier(userId: string): Promise<QuickFillTier> {
  if (isDatabaseConfigured()) {
    const rows = await query<{ tier: QuickFillTier; status: string; current_period_end: Date | string | null }>(
      "select tier, status, current_period_end from subscriptions where user_id = $1 order by updated_at desc limit 1",
      [userId],
    );
    const latest = rows[0];
    if (latest?.tier && isSubscriptionEntitled(latest.status, latest.current_period_end)) return latest.tier;
    return "free";
  }

  if (isRedisConfigured()) {
    const tier = await getRedis().get<QuickFillTier>(`sub:${userId}`);
    if (tier === "pro" || tier === "business") return tier;
  }

  return "free";
}

export async function recordUsageEvent(input: {
  userId?: string | null;
  anonymousId?: string | null;
  eventType: string;
  quantity?: number;
  metadata?: Record<string, unknown>;
}) {
  if (!isDatabaseConfigured()) return;

  await query(
    "insert into usage_events (user_id, anonymous_id, event_type, quantity, metadata) values ($1, $2, $3, $4, $5::jsonb)",
    [input.userId ?? null, input.anonymousId ?? null, input.eventType, input.quantity ?? 1, JSON.stringify(input.metadata ?? {})],
  );
}
