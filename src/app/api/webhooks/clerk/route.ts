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
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #1a1a2e;">
            <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">Welcome to QuickFill, ${firstName}!</h1>
            <p style="color: #6b7280; margin-bottom: 24px;">You can now fill any PDF form online in seconds — no software, no printing, no scanning.</p>

            <a href="${appUrl}/editor" style="display: inline-block; background: #4f8ef7; color: white; font-weight: 600; padding: 12px 24px; border-radius: 10px; text-decoration: none; margin-bottom: 32px;">
              Fill your first PDF →
            </a>

            <p style="font-size: 14px; color: #6b7280;">You get 3 free fills every month. Need more? <a href="${appUrl}/pricing" style="color: #4f8ef7;">Upgrade to Pro for $12/month</a>.</p>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
            <p style="font-size: 12px; color: #9ca3af;">QuickFill · <a href="${appUrl}/privacy" style="color: #9ca3af;">Privacy Policy</a> · <a href="${appUrl}/terms" style="color: #9ca3af;">Terms</a></p>
          </div>
        `,
      });
    }
  }

  return NextResponse.json({ received: true });
}
