import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { redis } from "@/lib/redis";
import type Stripe from "stripe";

const TTL_SECONDS = 35 * 24 * 60 * 60; // 35 days

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
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
      await redis.set(`sub:${userId}`, "pro", { ex: TTL_SECONDS });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.userId;
    if (userId) {
      await redis.del(`sub:${userId}`);
    }
  }

  return NextResponse.json({ received: true });
}
