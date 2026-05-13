import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { reconcileStripeBilling } from "@/lib/billing-reconciliation";
import { recordBillingSync } from "@/lib/billing-sync-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function requestedLimit(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("limit");
  if (!value) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await reconcileStripeBilling({ limit: requestedLimit(request) });
  await recordBillingSync(result, "admin");

  return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : 500 });
}
