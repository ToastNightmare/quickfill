import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { reconcileStripeBilling, type BillingReconciliationResult } from "@/lib/billing-reconciliation";
import { isDatabaseConfigured, query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function requestedLimit(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("limit");
  if (!value) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function recordBillingSync(result: BillingReconciliationResult) {
  if (!isDatabaseConfigured()) return;

  try {
    await query("insert into audit_events (event_type, metadata) values ($1, $2::jsonb)", [
      result.ok ? "billing_sync_ok" : "billing_sync_failed",
      JSON.stringify({ ...result, completedAt: new Date().toISOString() }),
    ]);
  } catch (error) {
    console.error("Failed to record billing sync audit event", error);
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return unauthorized();
  }

  const result = await reconcileStripeBilling({ limit: requestedLimit(request) });
  await recordBillingSync(result);

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
