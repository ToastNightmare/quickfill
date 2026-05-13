import type Stripe from "stripe";
import { isDatabaseConfigured, query } from "@/lib/db";
import { getRedis, isRedisConfigured } from "@/lib/redis";

export type QuickFillTier = "free" | "pro" | "business";

type StoredSubscriptionStatus = Stripe.Subscription.Status | "active" | "canceled" | "unknown";

type PeriodEndValue = Date | number | string | null | undefined;
type StripePeriodShape = { current_period_end?: number | null };

export interface StoredSubscriptionSnapshot {
  tier: QuickFillTier;
  status: string;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  updatedAt: string | null;
  entitled: boolean;
  needsReview: boolean;
  reviewReason: string | null;
}

const ENTITLED_STATUSES = new Set<string>(["active", "trialing"]);

function periodEndToTime(value: PeriodEndValue) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value * 1000;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function stripeSubscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const subscriptionPeriodEnd = (subscription as StripePeriodShape).current_period_end;
  if (typeof subscriptionPeriodEnd === "number") return subscriptionPeriodEnd;

  for (const item of subscription.items.data) {
    const itemPeriodEnd = (item as StripePeriodShape).current_period_end;
    if (typeof itemPeriodEnd === "number") return itemPeriodEnd;
  }

  return null;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : null;
}

function reviewReason(status: string, currentPeriodEnd?: PeriodEndValue) {
  if (!ENTITLED_STATUSES.has(status)) return null;

  const periodEnd = periodEndToTime(currentPeriodEnd);
  if (periodEnd === null) return "Missing renewal/end date from Stripe";
  if (periodEnd <= Date.now()) return "Billing period has ended";

  return null;
}

export function isSubscriptionEntitled(status: StoredSubscriptionStatus | string, currentPeriodEnd?: PeriodEndValue) {
  if (!ENTITLED_STATUSES.has(status)) return false;

  const periodEnd = periodEndToTime(currentPeriodEnd);
  if (periodEnd === null) return false;

  return periodEnd > Date.now();
}

async function clearCachedTier(userId: string) {
  if (!isRedisConfigured()) return;
  await getRedis().del(`sub:${userId}`);
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

export async function getStoredSubscriptionSnapshot(userId: string): Promise<StoredSubscriptionSnapshot | null> {
  if (!isDatabaseConfigured()) {
    if (!isRedisConfigured()) return null;
    const [tier, stripeCustomerId] = await Promise.all([
      getRedis().get<QuickFillTier>(`sub:${userId}`),
      getRedis().get<string>(`stripe_customer:${userId}`),
    ]);
    if (tier !== "pro" && tier !== "business") return null;
    return {
      tier,
      status: "redis_cache",
      currentPeriodEnd: null,
      stripeCustomerId: stripeCustomerId ?? null,
      stripeSubscriptionId: null,
      updatedAt: null,
      entitled: true,
      needsReview: true,
      reviewReason: "Redis-only subscription cache has no billing period",
    };
  }

  const rows = await query<{
    tier: QuickFillTier;
    status: string;
    current_period_end: Date | string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    updated_at: Date | string | null;
  }>(
    "select tier, status, current_period_end, stripe_customer_id, stripe_subscription_id, updated_at from subscriptions where user_id = $1 order by updated_at desc limit 1",
    [userId],
  );

  const latest = rows[0];
  if (!latest) return null;

  const reason = reviewReason(latest.status, latest.current_period_end);
  const entitled = isSubscriptionEntitled(latest.status, latest.current_period_end);

  return {
    tier: latest.tier,
    status: latest.status,
    currentPeriodEnd: toIso(latest.current_period_end),
    stripeCustomerId: latest.stripe_customer_id,
    stripeSubscriptionId: latest.stripe_subscription_id,
    updatedAt: toIso(latest.updated_at),
    entitled,
    needsReview: Boolean(reason),
    reviewReason: reason,
  };
}

export async function getStoredTier(userId: string): Promise<QuickFillTier> {
  const snapshot = await getStoredSubscriptionSnapshot(userId);
  if (snapshot) {
    if (snapshot.entitled) return snapshot.tier;
    await clearCachedTier(userId);
    return "free";
  }

  if (isDatabaseConfigured()) {
    await clearCachedTier(userId);
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
