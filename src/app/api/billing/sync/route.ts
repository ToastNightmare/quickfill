import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { reconcileStripeBillingForUser } from "@/lib/billing-reconciliation";
import { recordBillingSync } from "@/lib/billing-sync-audit";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BillingSyncResult = Awaited<ReturnType<typeof reconcileStripeBillingForUser>>;
type BillingSyncStatus = 200 | 401 | 429 | 500;
type BillingSyncReason = "ok" | "not_signed_in" | "rate_limited" | "sync_error";

type BillingSyncResponse = {
  userId: string | null;
  status: BillingSyncStatus;
  reason: BillingSyncReason;
  result: BillingSyncResult | null;
  error?: string;
};

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

function returnUrl(req: NextRequest, reason?: Exclude<BillingSyncReason, "ok">) {
  const url = new URL(safeReturnTo(req), req.url);
  if (reason) url.searchParams.set("billingSync", reason);
  return url;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function billingSyncSucceeded(result: BillingSyncResult | null) {
  return Boolean(result && (result.ok || result.updated > 0));
}

async function syncCurrentUserBilling(req: NextRequest): Promise<BillingSyncResponse> {
  try {
    const { userId } = await auth();
    if (!userId) return { userId: null, status: 401, reason: "not_signed_in", result: null };

    const limited = await checkRateLimit(requesterId(req, userId), "billingSync");
    if (!limited.success) return { userId, status: 429, reason: "rate_limited", result: null };

    let email: string | null = null;
    try {
      const user = await currentUser();
      email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
    } catch (error) {
      console.warn("billing_sync_current_user_lookup_failed", { userId, error: errorMessage(error) });
    }

    const result = await reconcileStripeBillingForUser(userId, { email });

    if (result.checked > 0 || result.updated > 0 || result.errors.length > 0) {
      try {
        await recordBillingSync(result, "customer");
      } catch (error) {
        console.warn("billing_sync_audit_record_failed", { userId, error: errorMessage(error) });
      }
    }

    return { userId, status: 200, reason: "ok", result };
  } catch (error) {
    console.error("billing_sync_failed", { error: errorMessage(error) });
    return { userId: null, status: 500, reason: "sync_error", result: null, error: errorMessage(error) };
  }
}

export async function GET(req: NextRequest) {
  const synced = await syncCurrentUserBilling(req);
  const reason = synced.reason === "ok" ? undefined : synced.reason;
  return NextResponse.redirect(returnUrl(req, reason));
}

export async function POST(req: NextRequest) {
  const synced = await syncCurrentUserBilling(req);
  if (synced.status === 401) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (synced.status === 429) {
    return NextResponse.json({ ok: false, error: "Too many billing checks, try again in a minute" }, { status: 429 });
  }
  if (synced.status === 500) {
    return NextResponse.json({ ok: false, error: "Billing sync failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: billingSyncSucceeded(synced.result), result: synced.result });
}
