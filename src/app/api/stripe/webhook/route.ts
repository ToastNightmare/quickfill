import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getRedis } from "@/lib/redis";
import { Resend } from "resend";
import type Stripe from "stripe";

const TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://getquickfill.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function tierFromPriceId(priceId: string): "pro" | "business" | null {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) return "pro";
  if (process.env.STRIPE_BUSINESS_PRICE_ID && priceId === process.env.STRIPE_BUSINESS_PRICE_ID) return "business";
  return null;
}

async function getEmailForCustomer(customerId: string): Promise<string | null> {
  try {
    const customer = await getStripe().customers.retrieve(customerId) as Stripe.Customer;
    return customer.email ?? null;
  } catch {
    return null;
  }
}

function emailWrapper(content: string) {
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a2e;">
      <div style="background: #0f1929; border-radius: 12px 12px 0 0; padding: 32px 40px; text-align: center;">
        <img src="${APP_URL}/logo-white.png" alt="QuickFill" style="height: 48px; width: auto;" />
      </div>
      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 40px;">
        ${content}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">QuickFill · <a href="${APP_URL}/privacy" style="color: #9ca3af;">Privacy Policy</a> · <a href="${APP_URL}/terms" style="color: #9ca3af;">Terms</a></p>
      </div>
    </div>
  `;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── Upgrade confirmed ──────────────────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    
    console.log("[WEBHOOK] checkout.session.completed received:", {
      sessionId: session.id,
      userId: session.metadata?.userId,
      plan: session.metadata?.plan,
      billing: session.metadata?.billing,
      customer: session.customer,
      subscription: session.subscription,
    });

    const userId = session.metadata?.userId;

    if (userId) {
      let tier: "pro" | "business" | null = null;
      const metaPlan = session.metadata?.plan;
      if (metaPlan === "business" || metaPlan === "pro") tier = metaPlan;

      if (!tier && session.subscription) {
        try {
          const subscription = await getStripe().subscriptions.retrieve(session.subscription as string);
          const priceId = subscription.items.data[0]?.price?.id;
          if (priceId) tier = tierFromPriceId(priceId);
          console.log("[WEBHOOK] Retrieved subscription, tier:", tier);
        } catch (err) {
          console.error("[WEBHOOK] Failed to retrieve subscription:", err);
        }
      }

      if (!tier) {
        tier = "pro"; // Default to pro if we can't determine
        console.log("[WEBHOOK] Defaulting to pro tier");
      }

      console.log("[WEBHOOK] Setting Redis key sub:", userId, "to", tier);
      await getRedis().set(`sub:${userId}`, tier, { ex: TTL_SECONDS });

      if (session.customer) {
        await getRedis().set(`stripe_customer:${userId}`, session.customer as string);
      }

      // Send upgrade confirmation email
      const email = session.customer_email ?? (session.customer ? await getEmailForCustomer(session.customer as string) : null);
      const isAnnual = session.metadata?.billing === "annual";

      if (email) {
        console.log("[WEBHOOK] Sending welcome email to:", email);
        await getResend().emails.send({
          from: "QuickFill <hello@getquickfill.com>",
          to: email,
          subject: "You're now Pro, welcome to QuickFill Pro! 🎉",
          html: emailWrapper(`
            <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 8px 0;">You're now Pro! 🎉</h1>
            <p style="color: #6b7280; margin: 0 0 24px 0;">Your QuickFill Pro subscription is active. Here's what's unlocked:</p>

            <div style="background: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #1e3a6e; line-height: 2;">
                <li><strong>Unlimited PDF fills</strong>, no monthly cap</li>
                <li><strong>No watermarks</strong> on downloads</li>
                <li><strong>Auto-fill from profile</strong></li>
                <li><strong>Unlimited fill history</strong></li>
                <li><strong>Priority support</strong></li>
              </ul>
            </div>

            <p style="font-size: 14px; color: #6b7280; margin: 0 0 8px 0;">
              ${isAnnual ? "Billed annually at <strong>$100/year</strong>." : "Billed monthly at <strong>$12/month</strong>."}
              You can manage or cancel your subscription any time from your dashboard.
            </p>

            <a href="${APP_URL}/editor" style="display: inline-block; background: #2d8ef7; color: white; font-weight: 600; padding: 14px 28px; border-radius: 10px; text-decoration: none; margin: 24px 0; font-size: 15px;">
              Start filling PDFs →
            </a>

            <p style="font-size: 13px; color: #9ca3af; margin: 0;">
              Need to manage billing? <a href="${APP_URL}/dashboard" style="color: #2d8ef7;">Visit your dashboard</a>
            </p>
          `),
        });
      }

      console.log("[WEBHOOK] checkout.session.completed processed successfully for user:", userId);
    }
  }

  // ── Subscription updated ───────────────────────────────────────────────────
  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.userId;

    if (userId) {
      const status = subscription.status;

      if (status === "active") {
        const priceId = subscription.items.data[0]?.price?.id;
        const tier = priceId ? tierFromPriceId(priceId) : null;
        await getRedis().set(`sub:${userId}`, tier ?? "pro", { ex: TTL_SECONDS });
      } else if (status === "past_due" || status === "unpaid") {
        await getRedis().del(`sub:${userId}`);

        // Send payment failed email
        const email = subscription.customer ? await getEmailForCustomer(subscription.customer as string) : null;
        if (email) {
          await getResend().emails.send({
            from: "QuickFill <hello@getquickfill.com>",
            to: email,
            subject: "Action needed, QuickFill payment failed",
            html: emailWrapper(`
              <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 8px 0;">Payment failed ⚠️</h1>
              <p style="color: #6b7280; margin: 0 0 24px 0;">We couldn't process your QuickFill Pro payment. Your account has been moved to the free plan.</p>
              <p style="font-size: 14px; color: #6b7280; margin: 0 0 24px 0;">Update your payment details to restore Pro access:</p>
              <a href="${APP_URL}/dashboard" style="display: inline-block; background: #2d8ef7; color: white; font-weight: 600; padding: 14px 28px; border-radius: 10px; text-decoration: none; margin-bottom: 24px; font-size: 15px;">
                Update payment details →
              </a>
              <p style="font-size: 13px; color: #9ca3af; margin: 0;">If you have any questions, reply to this email and we'll help you out.</p>
            `),
          });
        }
      } else if (status === "canceled" || status === "paused") {
        await getRedis().del(`sub:${userId}`);
      }
    }
  }

  // ── Subscription cancelled ─────────────────────────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.userId;

    if (userId) {
      await getRedis().del(`sub:${userId}`);

      // Send cancellation confirmation email
      const email = subscription.customer ? await getEmailForCustomer(subscription.customer as string) : null;
      if (email) {
        await getResend().emails.send({
          from: "QuickFill <hello@getquickfill.com>",
          to: email,
          subject: "Your QuickFill Pro subscription has ended",
          html: emailWrapper(`
            <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 8px 0;">Subscription ended</h1>
            <p style="color: #6b7280; margin: 0 0 24px 0;">Your QuickFill Pro subscription has been cancelled. You've been moved to the free plan (3 fills/month).</p>

            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="margin: 0; font-size: 14px; color: #374151;">Your filled PDFs and profile data are safe, nothing has been deleted.</p>
            </div>

            <p style="font-size: 14px; color: #6b7280; margin: 0 0 24px 0;">Changed your mind? You can resubscribe any time.</p>

            <a href="${APP_URL}/pricing" style="display: inline-block; background: #2d8ef7; color: white; font-weight: 600; padding: 14px 28px; border-radius: 10px; text-decoration: none; margin-bottom: 24px; font-size: 15px;">
              Resubscribe to Pro →
            </a>

            <p style="font-size: 13px; color: #9ca3af; margin: 0;">Thanks for trying QuickFill Pro. We'd love to have you back.</p>
          `),
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
