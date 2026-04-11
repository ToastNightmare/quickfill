import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  let evt: {
    type: string;
    data: {
      email_addresses?: { email_address: string }[];
      first_name?: string;
    };
  };

  try {
    evt = wh.verify(payload, headers) as typeof evt;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (evt.type === "user.created") {
    const email = evt.data.email_addresses?.[0]?.email_address;
    const firstName = evt.data.first_name ?? "there";

    if (email) {
      try {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL ?? "https://getquickfill.com";
        await getResend().emails.send({
          from: "QuickFill <hello@getquickfill.com>",
          to: email,
          subject: "Welcome to QuickFill",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1a1a2e;">
              <img src="https://getquickfill.com/logo.svg" alt="QuickFill" style="height: 40px; margin-bottom: 32px;" />
              <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 16px;">Welcome${firstName ? `, ${firstName}` : ""}!</h1>
              <p style="font-size: 15px; line-height: 1.6; color: #555; margin: 0 0 24px;">
                QuickFill is the fastest way to fill Australian PDF forms. Here is how to get started:
              </p>
              <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin: 0 0 24px;">
                <p style="font-size: 14px; font-weight: 600; margin: 0 0 12px; color: #1a1a2e;">3 steps to your first filled form:</p>
                <p style="font-size: 14px; margin: 0 0 8px; color: #555;">1. <a href="https://getquickfill.com/profile" style="color: #2d8ef7;">Set up your Australian profile</a> with your TFN, Medicare number, ABN and address</p>
                <p style="font-size: 14px; margin: 0 0 8px; color: #555;">2. <a href="https://getquickfill.com/templates" style="color: #2d8ef7;">Pick a template</a> or upload your own PDF</p>
                <p style="font-size: 14px; margin: 0; color: #555;">3. Hit Auto-fill and download your completed form</p>
              </div>
              <a href="https://getquickfill.com/editor" style="display: inline-block; background: #2d8ef7; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 0 0 32px;">Fill Your First Form</a>
              <p style="font-size: 13px; color: #999; margin: 0;">You are on the Free plan. You get 3 fills per month. <a href="https://getquickfill.com/pricing" style="color: #2d8ef7;">Upgrade to Pro</a> for unlimited fills.</p>
            </div>
          `,
        });
      } catch (err) {
        console.error("Failed to send welcome email:", err);
        // Don't fail the webhook if email fails
      }
    }
  }

  return NextResponse.json({ received: true });
}
