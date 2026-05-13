import { NextRequest, NextResponse } from "next/server";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { getRequestEntitlement } from "@/lib/entitlements";
import { getStoredSubscriptionSnapshot, recordUsageEvent } from "@/lib/billing-store";

const TTL_SECONDS = 35 * 24 * 60 * 60;
const GUEST_TTL_SECONDS = 30 * 24 * 60 * 60;

function monthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function usageKey(entitlement: Awaited<ReturnType<typeof getRequestEntitlement>>) {
  if (entitlement.userId) return `usage:${entitlement.userId}:${monthKey()}`;
  if (entitlement.anonymousId) return `guest:fills:${entitlement.anonymousId}`;
  return null;
}

function isDelinquentBillingStatus(status?: string | null) {
  return status === "past_due" || status === "unpaid" || status === "incomplete";
}

export async function GET(request: NextRequest) {
  const entitlement = await getRequestEntitlement(request);
  const key = usageKey(entitlement);
  const [used, subscription] = await Promise.all([
    key && isRedisConfigured() ? getRedis().get<number>(key) : Promise.resolve(0),
    entitlement.userId ? getStoredSubscriptionSnapshot(entitlement.userId) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    used: used ?? 0,
    limit: entitlement.limit,
    isPro: entitlement.isPaid,
    tier: entitlement.tier,
    guest: entitlement.tier === "guest",
    qa: entitlement.qa,
    billing: subscription
      ? {
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          updatedAt: subscription.updatedAt,
          entitled: subscription.entitled,
          needsReview: subscription.needsReview,
          reviewReason: subscription.reviewReason,
          hasStripeCustomer: Boolean(subscription.stripeCustomerId),
          delinquent: isDelinquentBillingStatus(subscription.status),
        }
      : null,
  });
}

export async function POST(request: NextRequest) {
  const entitlement = await getRequestEntitlement(request);
  const key = usageKey(entitlement);
  let used = 0;

  if (key && isRedisConfigured()) {
    used = await getRedis().incr(key);
    if (used === 1) {
      await getRedis().expire(key, key.startsWith("guest:") ? GUEST_TTL_SECONDS : TTL_SECONDS);
    }
  }

  await recordUsageEvent({
    userId: entitlement.userId,
    anonymousId: entitlement.anonymousId,
    eventType: "usage_increment",
    metadata: { tier: entitlement.tier },
  });

  return NextResponse.json({ used, guest: entitlement.tier === "guest", qa: entitlement.qa });
}
