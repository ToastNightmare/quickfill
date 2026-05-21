import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { getStoredTier } from "@/lib/billing-store";
import { checkRateLimit } from "@/lib/rate-limit";

export interface FillEntry {
  filename: string;
  filledAt: string;
  fieldCount: number;
  pageCount: number;
}

const MAX_FILL_JSON_CHARS = 10_000;

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function requestIdentifier(req: Request, userId: string) {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  return `fills:${userId}:${forwarded?.split(",")[0] || realIp || "unknown"}`;
}

function cleanText(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
}

function cleanCount(value: unknown, fallback: number) {
  const next = Number(value ?? fallback);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(Math.trunc(next), 0), 5000);
}

function cleanDate(value: unknown) {
  const raw = cleanText(value, 80);
  const date = raw ? new Date(raw) : new Date();
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }

  const tier = await getStoredTier(userId);
  const isBusiness = tier === "business";
  const isPro = tier === "pro";
  // -1 = all entries, 29 = index of 30th item (Pro: last 30), 9 = index of 10th item (Free: last 10)
  const rangeEnd = isBusiness ? -1 : isPro ? 29 : 9;
  const fills = await getRedis().lrange<FillEntry>(`fills:${userId}`, 0, rangeEnd);

  return privateJson({ fills: fills ?? [], isPro: isPro || isBusiness });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return privateJson({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(requestIdentifier(req, userId));
  if (!limited.success) {
    return privateJson({ error: "Too many history updates. Please try again shortly." }, { status: 429 });
  }

  const rawBody = await req.text().catch(() => "");
  if (!rawBody || rawBody.length > MAX_FILL_JSON_CHARS) {
    return privateJson({ error: "Fill history entry is too large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return privateJson({ error: "Invalid fill history entry" }, { status: 400 });
  }

  const filename = cleanText(body.filename, 180);
  if (!filename) {
    return privateJson(
      { error: "Missing required fields: filename, filledAt" },
      { status: 400 }
    );
  }

  const fillEntry: FillEntry = {
    filename,
    filledAt: cleanDate(body.filledAt),
    fieldCount: cleanCount(body.fieldCount, 0),
    pageCount: cleanCount(body.pageCount, 1),
  };

  const key = `fills:${userId}`;
  const tier = await getStoredTier(userId);
  // max index to keep: business=unlimited(999), pro=29(30 items), free=9(10 items)
  const maxIndex = tier === "business" ? 999 : tier === "pro" ? 29 : 9;

  await getRedis().lpush(key, fillEntry);
  await getRedis().ltrim(key, 0, maxIndex);

  return privateJson({ ok: true });
}
