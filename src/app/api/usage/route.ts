import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

const FREE_LIMIT = 3;
const TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days

function usageKey(userId: string) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `usage:${userId}:${month}`;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [used, sub] = await Promise.all([
    redis.get<number>(usageKey(userId)),
    redis.get<string>(`sub:${userId}`),
  ]);

  const isPro = sub === "pro";

  return NextResponse.json({
    used: used ?? 0,
    limit: FREE_LIMIT,
    isPro,
  });
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = usageKey(userId);
  const newCount = await redis.incr(key);

  // Set TTL on first increment
  if (newCount === 1) {
    await redis.expire(key, TTL_SECONDS);
  }

  return NextResponse.json({ used: newCount });
}
