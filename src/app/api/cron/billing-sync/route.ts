import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { reconcileStripeBilling } from "@/lib/billing-reconciliation";

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

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return unauthorized();
  }

  const result = await reconcileStripeBilling({ limit: requestedLimit(request) });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
