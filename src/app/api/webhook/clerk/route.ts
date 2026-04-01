import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { Resend } from "resend";
import { APP_CONFIG } from "@/lib/config";

// Required env vars:
// - RESEND_API_KEY: API key from resend.com
// - CLERK_WEBHOOK_SECRET: Signing secret from Clerk webhook settings

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses: { email_address: string }[];
    first_name?: string;
  };
}

export async function POST(req: NextRequest) {
  const body = await req.text();

  // Verify webhook signature if secret is configured
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (webhookSecret) {
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
    }

    try {
      const wh = new Webhook(webhookSecret);
      wh.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } else {
    console.warn("CLERK_WEBHOOK_SECRET not set  -  skipping signature verification");
  }

  const event = JSON.parse(body) as ClerkWebhookEvent;

  if (event.type === "user.created") {
    const email = event.data.email_addresses?.[0]?.email_address;
    if (!email) {
      return NextResponse.json({ received: true });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.warn("RESEND_API_KEY not set  -  skipping welcome email");
      return NextResponse.json({ received: true });
    }

    const resend = new Resend(resendKey);

    try {
      await resend.emails.send({
        from: "QuickFill <onboarding@resend.dev>",
        to: email,
        subject: "Welcome to QuickFill \ud83d\udc4b",
        html: `<div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <h1 style="color: #1a1a2e; font-size: 28px; margin-bottom: 8px;">Welcome to QuickFill</h1>
    <p style="color: #6b7280; font-size: 16px; margin-bottom: 24px;">The fastest way to fill PDF forms online.</p>
    <p style="color: #1a1a2e; font-size: 16px;">You have <strong>3 free fills per month</strong> to get started. No credit card required.</p>
    <a href="${APP_CONFIG.url}/editor" style="display: inline-block; margin-top: 24px; background: #4f8ef7; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Open the Editor</a>
    <hr style="margin: 40px 0; border: none; border-top: 1px solid #e5e7eb;" />
    <p style="color: #9ca3af; font-size: 13px;">QuickFill  -  Fill any PDF form online in seconds.<br/>Australian-made. Your documents never touch our servers.</p>
  </div>`,
      });
    } catch (err) {
      console.error("Failed to send welcome email:", err);
    }
  }

  return NextResponse.json({ received: true });
}
