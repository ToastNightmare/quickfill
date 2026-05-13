import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { reconcileStripeBillingForUser } from "@/lib/billing-reconciliation";
import { recordBillingSync } from "@/lib/billing-sync-audit";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function requesterId(req: NextRequest, userId: string) {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  return userId || forwarded?.split(",")[0] || realIp || "anonymous";
}

function safeReturnTo(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get("returnTo") ?? "/dashboard?upgraded=true";
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return "/dashboard?upgraded=true";
  return returnTo;
}

async function syncCurrentUserBilling(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return { userId: null, status: 401 as const, result: null };

  const limited = await checkRateLimit(requesterId(req, userId), "billingSync");
  if (!limited.success) return { userId, status: 429 as const, result: null };

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
  const result = await reconcileStripeBillingForUser(userId, { email });

  if (result.checked > 0 || result.updated > 0 || result.errors.length > 0) {
    await recordBillingSync(result, "customer");
  }

  return { userId, status: 200 as const, result };
}

export async function GET(req: NextRequest) {
  const synced = await syncCurrentUserBilling(req);
  const url = req.nextUrl.clone();
  url.pathname = safeReturnTo(req).split("?")[0];
  url.search = safeReturnTo(req).includes("?") ? `?${safeReturnTo(req).split("?").slice(1).join("?")}` : "";
  if (synced.status !== 200) {
    url.searchParams.set("billingSync", synced.status === 429 ? "rate_limited" : "not_signed_in");
  }
  return NextResponse.redirect(url);
}

export async function POST(req: NextRequest) {
  const synced = await syncCurrentUserBilling(req);
  if (synced.status === 401) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (synced.status === 429) {
    return NextResponse.json({ ok: false, error: "Too many billing checks, try again in a minute" }, { status: 429 });
  }

  return NextResponse.json({ ok: synced.result?.ok ?? false, result: synced.result });
}
