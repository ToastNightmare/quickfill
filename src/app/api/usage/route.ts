import { NextRequest, NextResponse } from "next/server";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { getRequestEntitlement, TIER_LIMITS } from "@/lib/entitlements";
import { getStoredSubscriptionSnapshot, recordUsageEvent } from "@/lib/billing-store";
import { checkRateLimit } from "@/lib/rate-limit";

const TTL_SECONDS = 35 * 24 * 60 * 60;
const GUEST_TTL_SECONDS = 30 * 24 * 60 * 60;

type Entitlement = Awaited<ReturnType<typeof getRequestEntitlement>>;

function monthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function usageKey(entitlement: Entitlement) {
  if (entitlement.userId) return `usage:${entitlement.userId}:${monthKey()}`;
  if (entitlement.anonymousId) return `guest:fills:${entitlement.anonymousId}`;
  return null;
}

function requestIdentifier(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  return forwarded?.split(",")[0] || realIp || "anonymous";
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

    return NextResponse.json({
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
    return NextResponse.json({
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

export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(requestIdentifier(request), "usage");
  if (!success) {
    return NextResponse.json({ error: "Too many usage updates. Please try again shortly." }, { status: 429 });
  }

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
