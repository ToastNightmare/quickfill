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

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(requesterId(req, userId), "billingSync");
  if (!limited.success) {
    return NextResponse.json({ ok: false, error: "Too many billing checks, try again in a minute" }, { status: 429 });
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
  const result = await reconcileStripeBillingForUser(userId, { email });

  if (result.checked > 0 || result.updated > 0 || result.errors.length > 0) {
    await recordBillingSync(result, "customer");
  }

  return NextResponse.json({ ok: result.ok, result });
}
