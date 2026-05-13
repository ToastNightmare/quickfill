import { clerkClient } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { reconcileStripeBillingForUser } from "@/lib/billing-reconciliation";
import { recordBillingSync } from "@/lib/billing-sync-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

async function userPrimaryEmail(userId: string) {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.find((item) => item.emailAddress)?.emailAddress ?? null;
  } catch {
    return null;
  }
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const result = await reconcileStripeBillingForUser(userId, { email: await userPrimaryEmail(userId) });
  await recordBillingSync(result, "admin");

  return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : 500 });
}
