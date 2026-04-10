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
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? "https://getquickfill.com";
      await getResend().emails.send({
        from: "QuickFill <hello@getquickfill.com>",
        to: email,
        subject: "Welcome to QuickFill \ud83d\udc4b",
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a2e;">

            <!-- Header -->
            <div style="background: #0f1929; border-radius: 12px 12px 0 0; padding: 32px 40px; text-align: center;">
              <img src="${appUrl}/logo-white.png" alt="QuickFill" style="height: 48px; width: auto;" />
            </div>

            <!-- Body -->
            <div style="background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 40px;">
              <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 8px 0;">Welcome, ${firstName}! 👋</h1>
              <p style="color: #6b7280; margin: 0 0 24px 0;">You can now fill any PDF form online in seconds, no software, no printing, no scanning.</p>

              <a href="${appUrl}/editor" style="display: inline-block; background: #2d8ef7; color: white; font-weight: 600; padding: 14px 28px; border-radius: 10px; text-decoration: none; margin-bottom: 32px; font-size: 15px;">
                Fill your first PDF →
              </a>

              <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 14px; color: #374151;"><strong>Your free plan includes:</strong></p>
                <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 14px; color: #6b7280; line-height: 1.8;">
                  <li>3 PDF fills per month</li>
                  <li>All field types, text, checkbox, signature, date</li>
                  <li>Instant download</li>
                </ul>
              </div>

              <p style="font-size: 14px; color: #6b7280; margin: 0;">Need unlimited fills? <a href="${appUrl}/pricing" style="color: #2d8ef7; font-weight: 600;">Upgrade to Pro, from $8.33/month</a>.</p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">QuickFill · <a href="${appUrl}/privacy" style="color: #9ca3af;">Privacy Policy</a> · <a href="${appUrl}/terms" style="color: #9ca3af;">Terms</a></p>
            </div>

          </div>
        `,
      });
    }
  }

  return NextResponse.json({ received: true });
}
