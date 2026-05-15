import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { APP_CONFIG } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackServerEvent } from "@/lib/server-analytics";
import { alertAdmins } from "@/lib/admin-alerts";
import { getStoredSubscriptionSnapshot } from "@/lib/billing-store";
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

function priceForPlan(plan: "pro" | "business", annual: boolean) {
  if (plan === "business") {
    return annual ? process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID : process.env.STRIPE_BUSINESS_PRICE_ID;
  }

  return annual ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID : process.env.STRIPE_PRO_PRICE_ID;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await checkRateLimit(requesterId(req, userId), "checkout");
  if (!limited.success) {
    return NextResponse.json({ error: "Too many checkout attempts, try again in a minute" }, { status: 429 });
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress;
  const firstName = user?.firstName ?? "";
  const origin = appOrigin(req);

  let plan: "pro" | "business" = "pro";
  let annual = false;
  try {
    const body = await req.json();
    if (body.plan === "business") plan = "business";
    if (body.annual === true) annual = true;
  } catch {
    // Default to Pro monthly when no JSON body is supplied.
  }

  const billing = annual ? "annual" : "monthly";
  const priceId = priceForPlan(plan, annual);
  if (!priceId) {
    log.error("stripe_checkout_missing_price", { plan, billing });
    await alertAdmins({
      subject: "Checkout price is missing",
      title: "Stripe checkout price is not configured",
      message: "A user tried to start checkout, but the required Stripe price ID is missing from production environment variables.",
      fields: { plan, billing, userId, email: email ?? "unknown" },
    });
    return NextResponse.json(
      { error: `${plan} ${billing} billing is not configured yet.` },
      { status: 500 },
    );
  }

  try {
    const metadata = { userId, plan, billing, firstName };
    const [snapshot, cachedCustomerId] = await Promise.all([
      getStoredSubscriptionSnapshot(userId),
      isRedisConfigured() ? getRedis().get<string>(`stripe_customer:${userId}`) : Promise.resolve(null),
    ]);
    const existingCustomerId = snapshot?.stripeCustomerId ?? cachedCustomerId;

    if (snapshot?.entitled && existingCustomerId) {
      const portalSession = await getStripe().billingPortal.sessions.create({
        customer: existingCustomerId,
        return_url: `${origin}/dashboard`,
      });
      return NextResponse.json({ url: portalSession.url, alreadySubscribed: true });
    }

    const successReturnTo = encodeURIComponent("/dashboard?upgraded=true");
    const cancelParams = new URLSearchParams({ checkout: "cancelled", plan, billing });

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      ...(existingCustomerId ? { customer: existingCustomerId } : { customer_email: email ?? undefined }),
      success_url: `${origin}/api/billing/sync?returnTo=${successReturnTo}`,
      cancel_url: `${origin}/pricing?${cancelParams.toString()}`,
      allow_promotion_codes: true,
      metadata,
      subscription_data: { metadata },
    });

    await trackServerEvent("checkout_start", { source: "server", plan, billing });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("stripe_checkout_session_failed", { plan, billing, error: message });
    await alertAdmins({
      subject: "Checkout session failed",
      title: "Stripe checkout could not be started",
      message: "A signed-in user could not be sent to Stripe Checkout.",
      fields: { plan, billing, userId, email: email ?? "unknown", error: message },
    });
    return NextResponse.json({ error: "Checkout could not be started. Please try again." }, { status: 500 });
  }
}
