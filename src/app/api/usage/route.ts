import { NextRequest, NextResponse } from "next/server";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { getRequestEntitlement, TIER_LIMITS } from "@/lib/entitlements";
import { getStoredSubscriptionSnapshot } from "@/lib/billing-store";

type Entitlement = Awaited<ReturnType<typeof getRequestEntitlement>>;

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function monthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function usageKey(entitlement: Entitlement) {
  if (entitlement.userId) return `usage:${entitlement.userId}:${monthKey()}`;
  if (entitlement.anonymousId) return `guest:fills:${entitlement.anonymousId}`;
  return null;
}

function isDelinquentBillingStatus(status?: string | null) {
  return status === "past_due" || status === "unpaid" || status === "incomplete";
}

function logUsageReadError(stage: string, error: unknown) {
  console.error("usage_read_failed", {
    stage,
    error: error instanceof Error ? error.message : String(error),
  });
}

function limitForTier(tier: Entitlement["tier"], fallback: number) {
  return TIER_LIMITS[tier] ?? fallback;
}

export async function GET(request: NextRequest) {
  try {
    const entitlement = await getRequestEntitlement(request);
    const key = usageKey(entitlement);
    const [usedResult, subscriptionResult] = await Promise.allSettled([
      key && isRedisConfigured() ? getRedis().get<number>(key) : Promise.resolve(0),
      entitlement.userId ? getStoredSubscriptionSnapshot(entitlement.userId) : Promise.resolve(null),
    ]);

    if (usedResult.status === "rejected") logUsageReadError("usage_counter", usedResult.reason);
    if (subscriptionResult.status === "rejected") logUsageReadError("subscription_snapshot", subscriptionResult.reason);

    const used = usedResult.status === "fulfilled" ? usedResult.value ?? 0 : 0;
    const subscription = subscriptionResult.status === "fulfilled" ? subscriptionResult.value : null;
    const subscriptionEntitled = Boolean(subscription?.entitled);
    const tier = subscriptionEntitled ? subscription!.tier : entitlement.tier;
    const isPaid = entitlement.isPaid || subscriptionEntitled;
    const limit = limitForTier(tier, entitlement.limit);

    return privateJson({
      used,
      limit,
      isPro: isPaid,
      tier,
      guest: tier === "guest",
      qa: entitlement.qa,
      degraded: usedResult.status === "rejected" || subscriptionResult.status === "rejected",
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
  } catch (error) {
    logUsageReadError("entitlement", error);
    return privateJson({
      used: 0,
      limit: 3,
      isPro: false,
      tier: "free",
      guest: false,
      qa: false,
      degraded: true,
      billing: null,
    });
  }
}

export async function POST() {
  return privateJson(
    { error: "Usage is recorded by completed PDF downloads." },
    { status: 405, headers: { Allow: "GET" } },
  );
}
