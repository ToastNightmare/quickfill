import { Resend } from "resend";
import { log } from "@/lib/log";

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

function fieldTable(fields: Record<string, unknown> = {}) {
  const rows = Object.entries(fields).map(([key, value]) => {
    const safeValue = typeof value === "string" ? value : JSON.stringify(value);
    return `
      <tr>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-weight: 700; vertical-align: top;">${escapeHtml(key)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-family: monospace; white-space: pre-wrap;">${escapeHtml(safeValue ?? "")}</td>
      </tr>
    `;
  });

  if (rows.length === 0) return "";
  return `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">${rows.join("")}</table>`;
}

export async function alertAdmins(input: {
  subject: string;
  title: string;
  message?: string;
  fields?: Record<string, unknown>;
}) {
  const to = adminEmails();
  const resend = getResend();
  if (!resend || to.length === 0) return;

  try {
    await resend.emails.send({
      from: "QuickFill Alerts <noreply@getquickfill.com>",
      to,
      subject: `[QuickFill alert] ${input.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #111827;">
          <h1 style="font-size: 20px; margin-bottom: 8px;">${escapeHtml(input.title)}</h1>
          <p style="color: #4b5563; line-height: 1.5;">${escapeHtml(input.message ?? "A QuickFill production event needs attention.")}</p>
          ${fieldTable({ time: new Date().toISOString(), ...(input.fields ?? {}) })}
        </div>
      `,
    });
  } catch (error) {
    log.warn("admin_alert_failed", { error: error instanceof Error ? error.message : String(error) });
  }
}
