import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getStoredSubscriptionSnapshot } from "@/lib/billing-store";
import { APP_CONFIG } from "@/lib/config";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { getStripe } from "@/lib/stripe";
import { checkRateLimit } from "@/lib/rate-limit";
import { alertAdmins } from "@/lib/admin-alerts";
import { log } from "@/lib/log";

function appOrigin(req: NextRequest) {
  const configured = APP_CONFIG.url;
  if (configured && !configured.includes("localhost")) return configured;
  return req.headers.get("origin") ?? configured ?? "http://localhost:3000";
}

function requesterId(req: NextRequest, userId: string) {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  return userId || forwarded?.split(",")[0] || realIp || "anonymous";
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(requesterId(req, userId), "portal");
  if (!limited.success) {
    return NextResponse.json({ error: "Too many billing portal attempts, try again in a minute" }, { status: 429 });
  }

  const [snapshot, cachedCustomerId] = await Promise.all([
    getStoredSubscriptionSnapshot(userId),
    isRedisConfigured() ? getRedis().get<string>(`stripe_customer:${userId}`) : Promise.resolve(null),
  ]);
  const customerId = snapshot?.stripeCustomerId ?? cachedCustomerId;

  if (!customerId) {
    return NextResponse.json({ error: "No subscription found. Please upgrade first." }, { status: 404 });
  }

  try {
    const origin = appOrigin(req);
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("stripe_portal_session_failed", { userId, customerId, error: message });
    await alertAdmins({
      subject: "Billing portal failed",
      title: "Stripe billing portal could not be opened",
      message: "A signed-in user tried to manage billing, but Stripe could not create a billing portal session.",
      fields: { userId, customerId, error: message },
    });
    return NextResponse.json({ error: "Billing portal could not be opened. Please try again." }, { status: 500 });
  }
}
