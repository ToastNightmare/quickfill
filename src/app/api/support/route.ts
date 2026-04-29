import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { recordSupportMessage } from "@/lib/admin-logs";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
}

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const identifier = forwarded?.split(",")[0] || realIp || "support";
  const { success } = await checkRateLimit("support:" + identifier);
  if (!success) {
    return NextResponse.json({ error: "Too many support requests, try again soon" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid support request" }, { status: 400 });
  }

  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const email = clean(body.email, 160) || user?.primaryEmailAddress?.emailAddress || "";
  const message = clean(body.message, 2000);

  if (!email || !message) {
    return NextResponse.json({ error: "Email and message are required" }, { status: 400 });
  }

  const entry = await recordSupportMessage({
    name: clean(body.name, 100) || user?.firstName || "QuickFill user",
    email,
    subject: clean(body.subject, 140) || "Support request",
    message,
    userId,
    source: clean(body.source, 80) || request.headers.get("referer") || "api",
  });

  return NextResponse.json({ ok: true, id: entry.id });
}
