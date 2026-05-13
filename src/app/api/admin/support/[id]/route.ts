import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { updateSupportMessageStatus, type AdminSupportStatus } from "@/lib/admin-logs";

export const runtime = "nodejs";

const SUPPORT_STATUSES = new Set<AdminSupportStatus>(["new", "open", "closed"]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const status = body && typeof body === "object" ? (body as { status?: unknown }).status : null;

  if (typeof status !== "string" || !SUPPORT_STATUSES.has(status as AdminSupportStatus)) {
    return NextResponse.json({ error: "Invalid support status" }, { status: 400 });
  }

  const { id } = await context.params;
  const message = await updateSupportMessageStatus(id, status as AdminSupportStatus);

  if (!message) {
    return NextResponse.json({ error: "Support message not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, message });
}
