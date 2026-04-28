import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getRedis } from "@/lib/redis";
import { Resend } from "resend";
import type Stripe from "stripe";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://getquickfill.com";

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

async function sendEmail(message: { from: string; to: string; subject: string; html: string }) {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send(message);
  } catch {
    // Email failures should not block Stripe webhook processing.
  }
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

async function getUserIdForCustomer(customerId: string): Promise<string | null> {
  return getRedis().get<string>(`stripe_customer_user:${customerId}`);
}

async function getUserIdForSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const metaUserId = subscription.metadata?.userId;
  if (metaUserId) return metaUserId;
  if (!subscription.customer) return null;
  return getUserIdForCustomer(subscription.customer as string);
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

function welcomeEmailContent(firstName: string | null, isAnnual: boolean) {
  const name = firstName || "there";
  const billingText = isAnnual ? "A$100/year" : "A$12/month";
  return `
    <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 16px 0; color: #4f8ef7;">Welcome to QuickFill Pro 🎉</h1>
    <p style="font-size: 16px; color: #374151; margin: 0 0 24px 0; line-height: 1.6;">Hi ${name},</p>
    
    <p style="font-size: 15px; color: #374151; margin: 0 0 16px 0; line-height: 1.6;">You're now on QuickFill Pro. Here's what you've unlocked:</p>
    
    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <ul style="margin: 0; padding-left: 20px; font-size: 15px; color: #374151; line-height: 2.2;">
        <li>✓ Unlimited PDF fills - no monthly limits</li>
        <li>✓ All 13+ Australian government templates</li>
        <li>✓ Priority support - we respond first</li>
      </ul>
    </div>
    
    <p style="font-size: 15px; color: #374151; margin: 0 0 16px 0; line-height: 1.6;">Get started right away:</p>
    
    <div style="text-align: center; margin: 28px 0;">
      <a href="${APP_URL}/editor" style="display: inline-block; background: #2d8ef7; color: white; font-weight: 600; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-size: 15px;">
        Start filling now
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; margin: 24px 0 8px 0; line-height: 1.6;">
      Your subscription renews automatically at <strong>${billingText}</strong>. You can manage or cancel anytime from your <a href="${APP_URL}/dashboard" style="color: #4f8ef7; text-decoration: none;">dashboard</a>.
    </p>
    
    <p style="font-size: 15px; color: #374151; margin: 24px 0 0 0; line-height: 1.6;">Thanks for supporting QuickFill.<br/><strong>The QuickFill Team</strong></p>
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
    
    // checkout.session.completed received

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
          // Retrieved subscription tier
        } catch (err) {
          // Failed to retrieve subscription
        }
      }

      if (!tier) {
        tier = "pro"; // Default to pro if we can't determine
        // Defaulting to pro tier
      }

      // Setting Redis subscription key
      await getRedis().set(`sub:${userId}`, tier);

      if (session.customer) {
        const customerId = session.customer as string;
        await getRedis().set(`stripe_customer:${userId}`, customerId);
        await getRedis().set(`stripe_customer_user:${customerId}`, userId);
      }

      if (session.subscription) {
        try {
          await getStripe().subscriptions.update(session.subscription as string, {
            metadata: {
              userId,
              plan: tier,
              billing: session.metadata?.billing ?? "monthly",
            },
          });
        } catch {
          // The reverse customer lookup still lets later subscription events find the user.
        }
      }

      // Send Pro welcome email
      const email = session.customer_email ?? (session.customer ? await getEmailForCustomer(session.customer as string) : null);
      const isAnnual = session.metadata?.billing === "annual";
      
      // Try to get first name from metadata or customer name
      let firstName: string | null = session.metadata?.firstName || null;
      if (!firstName && session.customer) {
        try {
          const customer = await getStripe().customers.retrieve(session.customer as string) as Stripe.Customer;
          if (customer.name) {
            firstName = customer.name.split(' ')[0];
          }
        } catch {
          // Ignore if we can't get customer name
        }
      }

      if (email) {
        // Sending Pro welcome email
        await sendEmail({
          from: "QuickFill <noreply@getquickfill.com>",
          to: email,
          subject: "Welcome to QuickFill Pro 🎉",
          html: emailWrapper(welcomeEmailContent(firstName, isAnnual)),
        });
      }

      // checkout.session.completed processed successfully
    }
  }

  // ── Subscription updated ───────────────────────────────────────────────────
  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = await getUserIdForSubscription(subscription);

    if (userId) {
      const status = subscription.status;

      if (status === "active") {
        const priceId = subscription.items.data[0]?.price?.id;
        const tier = priceId ? tierFromPriceId(priceId) : null;
        await getRedis().set(`sub:${userId}`, tier ?? "pro");
      } else if (status === "past_due" || status === "unpaid") {
        await getRedis().del(`sub:${userId}`);

        // Send payment failed email
        const email = subscription.customer ? await getEmailForCustomer(subscription.customer as string) : null;
        if (email) {
          await sendEmail({
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
    const userId = await getUserIdForSubscription(subscription);

    if (userId) {
      await getRedis().del(`sub:${userId}`);

      // Send cancellation confirmation email
      const email = subscription.customer ? await getEmailForCustomer(subscription.customer as string) : null;
      if (email) {
        await sendEmail({
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
