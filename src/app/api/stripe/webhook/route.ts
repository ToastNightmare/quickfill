import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getRedis } from "@/lib/redis";
import type Stripe from "stripe";

const TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days

function tierFromPriceId(priceId: string): "pro" | "business" | null {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  if (
    process.env.STRIPE_BUSINESS_PRICE_ID &&
    priceId === process.env.STRIPE_BUSINESS_PRICE_ID
  )
    return "business";
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    if (userId) {
      // Determine tier from metadata or price ID
      let tier: "pro" | "business" | null = null;

      // Check metadata first (set during checkout)
      const metaPlan = session.metadata?.plan;
      if (metaPlan === "business" || metaPlan === "pro") {
        tier = metaPlan;
      }

      // Fall back to checking the subscription's price ID
      if (!tier && session.subscription) {
        try {
          const subscription = await getStripe().subscriptions.retrieve(
            session.subscription as string
          );
          const priceId = subscription.items.data[0]?.price?.id;
          if (priceId) {
            tier = tierFromPriceId(priceId);
          }
        } catch {
          // Fall through to default
        }
      }

      await getRedis().set(`sub:${userId}`, tier ?? "pro", { ex: TTL_SECONDS });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.userId;
    if (userId) {
      await getRedis().del(`sub:${userId}`);
    }
  }

  return NextResponse.json({ received: true });
}
