import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/redis";
import { ANALYTICS_EVENT_SET } from "@/lib/analytics-events";

export const runtime = "nodejs";

const MAX_PROPERTIES = 12;
const DAY_SECONDS = 60 * 60 * 24;

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function cleanValue(value: unknown) {
  if (typeof value === "string") return value.slice(0, 120);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return null;
}

function cleanProperties(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const output: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of Object.entries(input).slice(0, MAX_PROPERTIES)) {
    const key = rawKey.replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, 40);
    if (!key) continue;
    output[key] = cleanValue(rawValue);
  }
  return output;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name : "";

    if (!ANALYTICS_EVENT_SET.has(name)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const properties = cleanProperties(body?.properties);
    const { userId } = await auth();
    const redis = getRedis();
    const day = dayKey();
    const dailyKey = `analytics:${day}`;
    const totalKey = "analytics:total";

    const pipeline = redis.pipeline();
    pipeline.hincrby(dailyKey, name, 1);
    pipeline.expire(dailyKey, DAY_SECONDS * 120);
    pipeline.hincrby(totalKey, name, 1);
    pipeline.lpush("analytics:recent", {
      name,
      properties,
      signedIn: Boolean(userId),
      createdAt: new Date().toISOString(),
    });
    pipeline.ltrim("analytics:recent", 0, 499);
    await pipeline.exec();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 202 });
  }
}
