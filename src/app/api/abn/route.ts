import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { log } from "@/lib/log";

const CACHE_SECONDS = 24 * 60 * 60;

function requesterId(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  return forwarded?.split(",")[0] || realIp || "anonymous";
}

export async function GET(req: NextRequest) {
  const abn = new URL(req.url).searchParams.get("abn");
  if (!abn) return NextResponse.json({ error: "Missing ABN" }, { status: 400 });

  const clean = abn.replace(/\s/g, "");
  const limited = await checkRateLimit(requesterId(req), "abn");
  if (!limited.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const cacheKey = `abn:${clean}`;
  if (isRedisConfigured()) {
    const cached = await getRedis().get<unknown>(cacheKey);
    if (cached) return NextResponse.json(cached, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } });
  }

  try {
    const guid = process.env.ABR_GUID ?? "00000000-0000-0000-0000-000000000000";
    const res = await fetch(`https://api.abr.business.gov.au/abn/v3/json?abn=${clean}&guid=${guid}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: CACHE_SECONDS },
    });
    const data = await res.json();
    if (isRedisConfigured()) await getRedis().set(cacheKey, data, { ex: CACHE_SECONDS });
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } });
  } catch (error) {
    log.error("abn_lookup_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
