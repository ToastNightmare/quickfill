import { NextRequest, NextResponse } from "next/server";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { getRequestEntitlement } from "@/lib/entitlements";
import { recordUsageEvent } from "@/lib/billing-store";

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

export async function GET(request: NextRequest) {
  const entitlement = await getRequestEntitlement(request);
  const key = usageKey(entitlement);
  const used = key && isRedisConfigured() ? await getRedis().get<number>(key) : 0;

  return NextResponse.json({
    used: used ?? 0,
    limit: entitlement.limit,
    isPro: entitlement.isPaid,
    tier: entitlement.tier,
    guest: entitlement.tier === "guest",
    qa: entitlement.qa,
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
