import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getStoredSubscriptionSnapshot } from "@/lib/billing-store";
import { APP_CONFIG } from "@/lib/config";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { getStripe } from "@/lib/stripe";

function appOrigin(req: NextRequest) {
  const configured = APP_CONFIG.url;
  if (configured && !configured.includes("localhost")) return configured;
  return req.headers.get("origin") ?? configured ?? "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [snapshot, cachedCustomerId] = await Promise.all([
    getStoredSubscriptionSnapshot(userId),
    isRedisConfigured() ? getRedis().get<string>(`stripe_customer:${userId}`) : Promise.resolve(null),
  ]);
  const customerId = snapshot?.stripeCustomerId ?? cachedCustomerId;

  if (!customerId) {
    return NextResponse.json({ error: "No subscription found. Please upgrade first." }, { status: 404 });
  }

  const origin = appOrigin(req);
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
