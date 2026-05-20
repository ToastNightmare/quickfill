import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { recordSupportMessage, type AdminSupportCategory, type AdminSupportMessage } from "@/lib/admin-logs";
import { getStoredSubscriptionSnapshot } from "@/lib/billing-store";
import { getRequestEntitlement } from "@/lib/entitlements";
import { checkRateLimit } from "@/lib/rate-limit";
import { cleanSupportAttachments } from "@/lib/support-attachments";
import { log } from "@/lib/log";

export const runtime = "nodejs";

const SUPPORT_CATEGORIES = new Set<AdminSupportCategory>(["general", "pdf", "billing", "account", "bug"]);

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max);
}

function adminEmails() {
  return (process.env.QUICKFILL_ALERT_EMAILS ?? process.env.QUICKFILL_ADMIN_EMAILS ?? "")
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
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanCategory(value: unknown): AdminSupportCategory | null {
  return typeof value === "string" && SUPPORT_CATEGORIES.has(value as AdminSupportCategory)
    ? (value as AdminSupportCategory)
    : null;
}

function inferCategory(subject: string, message: string): AdminSupportCategory {
  const text = `${subject} ${message}`.toLowerCase();
  if (/bill|checkout|charge|charged|payment|price|pricing|pro|stripe|subscription|refund/.test(text)) return "billing";
  if (/pdf|form|field|download|upload|whiteout|signature|editor/.test(text)) return "pdf";
  if (/account|login|log in|sign in|signup|sign up|password|email/.test(text)) return "account";
  if (/bug|broken|crash|error|fail|failed|issue|problem|not working/.test(text)) return "bug";
  return "general";
}

function inferPriority(subject: string, message: string) {
  const text = `${subject} ${message}`.toLowerCase();
  if (/urgent|emergency|can't access|cannot access|charged|refund|payment failed|locked out/.test(text)) return "high";
  return "normal";
}

async function getRequestUser() {
  try {
    const { userId } = await auth();
    if (!userId) return { userId: null, user: null };

    try {
      return { userId, user: await currentUser() };
    } catch (error) {
      log.warn("support_current_user_lookup_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { userId, user: null };
    }
  } catch (error) {
    log.warn("support_auth_lookup_failed", { error: error instanceof Error ? error.message : String(error) });
    return { userId: null, user: null };
  }
}

async function supportPlanContext(request: NextRequest, userId: string | null) {
  if (!userId) return "";

  try {
    const entitlement = await getRequestEntitlement(request);
    const subscription = entitlement.userId ? await getStoredSubscriptionSnapshot(entitlement.userId) : null;
    const tier = subscription?.tier ?? entitlement.tier;
    const entitled = Boolean(entitlement.isPaid || subscription?.entitled);
    const status = subscription?.status ? `billing=${subscription.status}` : "billing=unknown";
    return `server_plan=${entitled ? "pro" : tier}; tier=${tier}; ${status}`;
  } catch (error) {
    log.warn("support_plan_context_failed", { error: error instanceof Error ? error.message : String(error) });
    return "";
  }
}

function supportSource(request: NextRequest, body: Record<string, unknown>, planContext: string) {
  const source = clean(body.source, 120);
  const page = clean(body.page, 80);
  const fallback = request.headers.get("referer") || "support";
  const parts = [source || (page ? `page=${page}` : ""), planContext].filter(Boolean);
  return (parts.join(" | ").slice(0, 160) || fallback).slice(0, 160);
}

function attachmentSummary(entry: AdminSupportMessage) {
  const count = entry.attachments.length;
  if (count === 0) return "";
  return `<p><strong>Attachments:</strong> ${count} screenshot${count === 1 ? "" : "s"} available in the admin support inbox.</p>`;
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
          <p><strong>Category:</strong> ${escapeHtml(entry.category)}</p>
          <p><strong>Priority:</strong> ${escapeHtml(entry.priority)}</p>
          <p><strong>Source:</strong> ${escapeHtml(entry.source ?? "unknown")}</p>
          <p><strong>User ID:</strong> ${escapeHtml(entry.userId ?? "guest")}</p>
          <p><strong>Created:</strong> ${escapeHtml(entry.createdAt)}</p>
          ${attachmentSummary(entry)}
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
  try {
    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const identifier = forwarded?.split(",")[0] || realIp || "support";
    const { success } = await checkRateLimit("support:" + identifier, "support");
    if (!success) {
      return NextResponse.json({ error: "Too many support requests, try again soon" }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid support request" }, { status: 400 });
    }

    if (clean((body as Record<string, unknown>).company, 100)) {
      log.warn("support_honeypot_triggered", { identifier });
      return NextResponse.json({ ok: true });
    }

    const bodyRecord = body as Record<string, unknown>;
    const { userId, user } = await getRequestUser();
    const email = clean(bodyRecord.email, 160) || user?.primaryEmailAddress?.emailAddress || "";
    const subject = clean(bodyRecord.subject, 140) || "Support request";
    const message = clean(bodyRecord.message, 2000);
    const attachments = cleanSupportAttachments(bodyRecord.attachments);

    if (!email || !message) {
      return NextResponse.json({ error: "Email and message are required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();
    const emailLimit = await checkRateLimit("support-email:" + normalizedEmail, "support");
    if (!emailLimit.success) {
      return NextResponse.json({ error: "Too many support requests, try again soon" }, { status: 429 });
    }

    if (userId) {
      const userLimit = await checkRateLimit("support-user:" + userId, "support");
      if (!userLimit.success) {
        return NextResponse.json({ error: "Too many support requests, try again soon" }, { status: 429 });
      }
    }

    const planContext = await supportPlanContext(request, userId);
    const category = cleanCategory(bodyRecord.category) ?? inferCategory(subject, message);
    const entry = await recordSupportMessage({
      name: clean(bodyRecord.name, 100) || user?.firstName || "QuickFill user",
      email,
      subject,
      message,
      userId,
      source: supportSource(request, bodyRecord, planContext),
      category,
      attachments,
      priority: inferPriority(subject, message),
    });

    await notifyAdmins(entry);

    return NextResponse.json({ ok: true, id: entry.id });
  } catch (error) {
    log.error("support_request_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not send support message" }, { status: 500 });
  }
}
