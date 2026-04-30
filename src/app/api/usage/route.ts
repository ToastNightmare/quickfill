import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import crypto from "crypto";

const TIER_LIMITS: Record<string, number> = {
  free: 3,
  pro: Infinity,
  business: 50,
};

const TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days for authenticated users
const GUEST_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days for guest users

function usageKey(userId: string) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `usage:${userId}:${month}`;
}

function getGuestIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0] || realIp || "unknown";
  // Hash the IP to create an anonymous identifier
  const hash = crypto.createHash("sha256").update(ip).digest("hex");
  return `guest:fills:${hash}`;
}

function hasValidQaToken(request: NextRequest): boolean {
  const expected = process.env.QUICKFILL_QA_TOKEN;
  const provided = request.headers.get("x-quickfill-qa-token");
  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function GET(request: NextRequest) {
  if (hasValidQaToken(request)) {
    return NextResponse.json({
      used: 0,
      limit: Infinity,
      isPro: true,
      tier: "qa",
      qa: true,
    });
  }

  const { userId } = await auth();
  
  // Guest mode: track usage by IP hash
  if (!userId) {
    const guestKey = getGuestIdentifier(request);
    const used = await getRedis().get<number>(guestKey);
    return NextResponse.json({
      used: used ?? 0,
      limit: 3,
      isPro: false,
      tier: "guest",
      guest: true,
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

export async function POST(request: NextRequest) {
  if (hasValidQaToken(request)) {
    return NextResponse.json({ used: 0, qa: true });
  }

  const { userId } = await auth();
  
  // Guest mode: track usage by IP hash server-side
  if (!userId) {
    const guestKey = getGuestIdentifier(request);
    const newCount = await getRedis().incr(guestKey);
    
    // Set TTL on first increment
    if (newCount === 1) {
      await getRedis().expire(guestKey, GUEST_TTL_SECONDS);
    }
    
    return NextResponse.json({ used: newCount, guest: true });
  }

  const key = usageKey(userId);
  const newCount = await getRedis().incr(key);

  // Set TTL on first increment
  if (newCount === 1) {
    await getRedis().expire(key, TTL_SECONDS);
  }

  return NextResponse.json({ used: newCount });
}
