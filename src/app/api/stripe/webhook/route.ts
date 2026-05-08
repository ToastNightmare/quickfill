import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { trackServerEvent } from "@/lib/server-analytics";
import { claimStripeEvent, saveSubscriptionSnapshot, tierFromPriceId, type QuickFillTier } from "@/lib/billing-store";
import { log } from "@/lib/log";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://getquickfill.com";

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

async function sendEmail(message: { to: string; subject: string; html: string }) {
  const resend = getResend();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: "QuickFill <noreply@getquickfill.com>",
      ...message,
    });
  } catch (error) {
    log.warn("email_send_failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

function emailWrapper(content: string) {
  return `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a2e;">
      <div style="background: #0f1929; border-radius: 12px 12px 0 0; padding: 32px 40px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 28px;">QuickFill</h1>
      </div>
      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 40px;">
        ${content}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">QuickFill | <a href="${APP_URL}/privacy" style="color: #9ca3af;">Privacy Policy</a> | <a href="${APP_URL}/terms" style="color: #9ca3af;">Terms</a></p>
      </div>
    </div>
  `;
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  return (subscription as unknown as { current_period_end?: number | null }).current_period_end ?? null;
}

function subscriptionTier(subscription: Stripe.Subscription): QuickFillTier {
  const metadataTier = subscription.metadata?.plan;
  if (metadataTier === "pro" || metadataTier === "business") return metadataTier;

  const priceId = subscription.items.data[0]?.price?.id;
  return tierFromPriceId(priceId) ?? "pro";
}

async function getEmailForCustomer(customerId: string): Promise<string | null> {
  try {
    const customer = (await getStripe().customers.retrieve(customerId)) as Stripe.Customer;
    return customer.email ?? null;
  } catch {
    return null;
  }
}

async function getUserIdForCustomer(customerId: string): Promise<string | null> {
  if (!isRedisConfigured()) return null;
  return getRedis().get<string>(`stripe_customer_user:${customerId}`);
}

async function getUserIdForSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const metaUserId = subscription.metadata?.userId;
  if (metaUserId) return metaUserId;
  if (!subscription.customer) return null;
  return getUserIdForCustomer(subscription.customer as string);
}

async function saveSubscriptionForUser(userId: string, subscription: Stripe.Subscription) {
  const customerId = subscription.customer ? String(subscription.customer) : null;
  const tier = subscriptionTier(subscription);

  await saveSubscriptionSnapshot({
    userId,
    customerId,
    subscriptionId: subscription.id,
    tier,
    status: subscription.status,
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
  });

  return { tier, customerId };
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) {
    log.warn("stripe_checkout_missing_user", { sessionId: session.id });
    return;
  }

  let tier: QuickFillTier = session.metadata?.plan === "business" ? "business" : "pro";
  let subscription: Stripe.Subscription | null = null;

  if (session.subscription) {
    subscription = await getStripe().subscriptions.retrieve(session.subscription as string);
    tier = subscriptionTier(subscription);
    await getStripe().subscriptions.update(subscription.id, {
      metadata: {
        userId,
        plan: tier,
        billing: session.metadata?.billing ?? "monthly",
      },
    });
  }

  const customerId = session.customer ? String(session.customer) : null;
  await saveSubscriptionSnapshot({
    userId,
    customerId,
    subscriptionId: subscription?.id ?? (session.subscription ? String(session.subscription) : null),
    tier,
    status: subscription?.status ?? "active",
    currentPeriodEnd: subscription ? subscriptionPeriodEnd(subscription) : null,
  });

  const email = session.customer_email ?? (customerId ? await getEmailForCustomer(customerId) : null);
  if (email) {
    await sendEmail({
      to: email,
      subject: "Welcome to QuickFill Pro",
      html: emailWrapper(`
        <h2 style="font-size: 24px; margin: 0 0 16px 0; color: #2563eb;">Welcome to QuickFill ${tier === "business" ? "Business" : "Pro"}</h2>
        <p style="font-size: 15px; color: #374151; line-height: 1.6;">Your subscription is active. You can start filling PDFs right away.</p>
        <p style="margin-top: 24px;"><a href="${APP_URL}/editor" style="background: #2563eb; color: white; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">Open QuickFill</a></p>
      `),
    });
  }

  await trackServerEvent("subscription_started", {
    source: "stripe_checkout",
    tier,
    billing: session.metadata?.billing ?? "monthly",
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = await getUserIdForSubscription(subscription);
  if (!userId) {
    log.warn("stripe_subscription_missing_user", { subscriptionId: subscription.id, status: subscription.status });
    return;
  }

  const { tier } = await saveSubscriptionForUser(userId, subscription);

  if (subscription.status === "past_due" || subscription.status === "unpaid") {
    const email = subscription.customer ? await getEmailForCustomer(String(subscription.customer)) : null;
    if (email) {
      await sendEmail({
        to: email,
        subject: "Action needed, QuickFill payment failed",
        html: emailWrapper(`
          <h2 style="font-size: 24px; margin: 0 0 16px 0;">Payment failed</h2>
          <p style="font-size: 15px; color: #374151; line-height: 1.6;">We could not process your QuickFill payment. Update your payment details from your dashboard to restore paid access.</p>
          <p style="margin-top: 24px;"><a href="${APP_URL}/dashboard" style="background: #2563eb; color: white; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">Open dashboard</a></p>
        `),
      });
    }
  }

  await trackServerEvent("subscription_updated", { source: "stripe_subscription", tier, status: subscription.status });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = await getUserIdForSubscription(subscription);
  if (!userId) {
    log.warn("stripe_subscription_deleted_missing_user", { subscriptionId: subscription.id });
    return;
  }

  await saveSubscriptionSnapshot({
    userId,
    customerId: subscription.customer ? String(subscription.customer) : null,
    subscriptionId: subscription.id,
    tier: "free",
    status: "canceled",
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
  });

  const email = subscription.customer ? await getEmailForCustomer(String(subscription.customer)) : null;
  if (email) {
    await sendEmail({
      to: email,
      subject: "Your QuickFill subscription has ended",
      html: emailWrapper(`
        <h2 style="font-size: 24px; margin: 0 0 16px 0;">Subscription ended</h2>
        <p style="font-size: 15px; color: #374151; line-height: 1.6;">Your account has been moved back to the free plan. You can resubscribe any time from pricing.</p>
        <p style="margin-top: 24px;"><a href="${APP_URL}/pricing" style="background: #2563eb; color: white; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">View plans</a></p>
      `),
    });
  }

  await trackServerEvent("subscription_cancelled", { source: "stripe_subscription" });
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

  const claimed = await claimStripeEvent(event.id, event.type);
  if (!claimed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === "customer.subscription.updated") {
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
    } else if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    }

    log.info("stripe_webhook_processed", { eventId: event.id, eventType: event.type });
    return NextResponse.json({ received: true });
  } catch (error) {
    log.error("stripe_webhook_failed", {
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
