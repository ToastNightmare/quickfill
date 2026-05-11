import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { recordSupportMessage, type AdminSupportMessage } from "@/lib/admin-logs";
import { checkRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";

export const runtime = "nodejs";

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
}

function adminEmails() {
  return (process.env.QUICKFILL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function notifyAdmins(entry: AdminSupportMessage) {
  const to = adminEmails();
  const resend = getResend();
  if (!resend || to.length === 0) return;

  try {
    await resend.emails.send({
      from: "QuickFill Support <noreply@getquickfill.com>",
      to,
      replyTo: entry.email,
      subject: `[QuickFill support] ${entry.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827;">
          <h1 style="font-size: 20px; margin-bottom: 16px;">New QuickFill support request</h1>
          <p><strong>From:</strong> ${escapeHtml(entry.name)} &lt;${escapeHtml(entry.email)}&gt;</p>
          <p><strong>Source:</strong> ${escapeHtml(entry.source ?? "unknown")}</p>
          <p><strong>User ID:</strong> ${escapeHtml(entry.userId ?? "guest")}</p>
          <p><strong>Created:</strong> ${escapeHtml(entry.createdAt)}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="white-space: pre-wrap; line-height: 1.5;">${escapeHtml(entry.message)}</p>
        </div>
      `,
    });
  } catch (error) {
    log.warn("support_admin_email_failed", { error: error instanceof Error ? error.message : String(error) });
  }
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

  await notifyAdmins(entry);

  return NextResponse.json({ ok: true, id: entry.id });
}
