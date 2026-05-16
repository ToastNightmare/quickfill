import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { getStoredTier, type QuickFillTier } from "@/lib/billing-store";

export const TIER_LIMITS: Record<QuickFillTier | "guest" | "qa", number> = {
  free: 3,
  guest: 3,
  pro: Number.POSITIVE_INFINITY,
  business: 50,
  qa: Number.POSITIVE_INFINITY,
};

export function hasValidQaToken(request: NextRequest) {
  const expected = process.env.QUICKFILL_QA_TOKEN;
  const provided = request.headers.get("x-quickfill-qa-token");
  if (!expected || !provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function getAnonymousId(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0] || realIp || "unknown";
  return crypto.createHash("sha256").update(ip).digest("hex");
}

function logEntitlementError(userId: string, error: unknown) {
  console.error("entitlement_lookup_failed", {
    userId,
    error: error instanceof Error ? error.message : String(error),
  });
}

export async function getRequestEntitlement(request: NextRequest) {
  if (hasValidQaToken(request)) {
    return { userId: null, anonymousId: null, tier: "qa" as const, limit: TIER_LIMITS.qa, isPaid: true, qa: true };
  }

  const { userId } = await auth();
  if (!userId) {
    return { userId: null, anonymousId: getAnonymousId(request), tier: "guest" as const, limit: TIER_LIMITS.guest, isPaid: false, qa: false };
  }

  let tier: QuickFillTier = "free";
  try {
    tier = await getStoredTier(userId);
  } catch (error) {
    logEntitlementError(userId, error);
  }

  return { userId, anonymousId: null, tier, limit: TIER_LIMITS[tier], isPaid: tier === "pro" || tier === "business", qa: false };
}
