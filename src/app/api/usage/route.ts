import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

const TIER_LIMITS: Record<string, number> = {
  free: 3,
  pro: Infinity,
  business: 50,
};

const TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days

function usageKey(userId: string) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `usage:${userId}:${month}`;
}

export async function GET() {
  const { userId } = await auth();
  
  // Guest mode: allow 1 fill without sign-up
  if (!userId) {
    const guestKey = "usage:guest";
    const used = await getRedis().get<number>(guestKey);
    return NextResponse.json({
      used: used ?? 0,
      limit: 1,
      isPro: false,
      tier: "guest",
    });
  }

  const [used, sub] = await Promise.all([
    getRedis().get<number>(usageKey(userId)),
    getRedis().get<string>(`sub:${userId}`),
  ]);

  const tier = sub ?? "free";
  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
  const isPro = tier === "pro" || tier === "business";

  return NextResponse.json({
    used: used ?? 0,
    limit,
    isPro,
    tier,
  });
}

export async function POST() {
  const { userId } = await auth();
  
  // Guest mode: track usage in localStorage, return success
  if (!userId) {
    return NextResponse.json({ used: 1, guest: true });
  }

  const key = usageKey(userId);
  const newCount = await getRedis().incr(key);

  // Set TTL on first increment
  if (newCount === 1) {
    await getRedis().expire(key, TTL_SECONDS);
  }

  return NextResponse.json({ used: newCount });
}
