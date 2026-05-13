import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { updateSupportMessage, type AdminSupportMessagePatch, type AdminSupportStatus } from "@/lib/admin-logs";

export const runtime = "nodejs";

const SUPPORT_STATUSES = new Set<AdminSupportStatus>(["new", "open", "closed"]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

function cleanText(value: unknown, max = 4000) {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ")
    .trim()
    .slice(0, max);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid support update" }, { status: 400 });
  }

  const input = body as {
    status?: unknown;
    assignee?: unknown;
    internalNotes?: unknown;
    replySent?: unknown;
  };
  const patch: AdminSupportMessagePatch = {};

  if (typeof input.status === "string") {
    if (!SUPPORT_STATUSES.has(input.status as AdminSupportStatus)) {
      return NextResponse.json({ error: "Invalid support status" }, { status: 400 });
    }
    patch.status = input.status as AdminSupportStatus;
  }

  if (Object.prototype.hasOwnProperty.call(input, "assignee")) {
    patch.assignee = cleanText(input.assignee, 120) || null;
  }

  if (typeof input.internalNotes === "string") {
    patch.internalNotes = cleanText(input.internalNotes, 4000) ?? "";
  }

  if (input.replySent === true) {
    patch.replySent = true;
  }

  const { id } = await context.params;
  const message = await updateSupportMessage(id, patch);

  if (!message) {
    return NextResponse.json({ error: "Support message not found or unchanged" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, message });
}
