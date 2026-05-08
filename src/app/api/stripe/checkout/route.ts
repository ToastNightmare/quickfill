import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { APP_CONFIG } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";

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
  const email = user?.emailAddresses?.[0]?.emailAddress;
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

  const priceId = priceForPlan(plan, annual);
  if (!priceId) {
    return NextResponse.json(
      { error: `${plan} ${annual ? "annual" : "monthly"} billing is not configured yet.` },
      { status: 500 },
    );
  }

  const metadata = { userId, plan, billing: annual ? "annual" : "monthly", firstName };
  const existingCustomerId = isRedisConfigured() ? await getRedis().get<string>(`stripe_customer:${userId}`) : null;

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    ...(existingCustomerId ? { customer: existingCustomerId } : { customer_email: email ?? undefined }),
    success_url: `${origin}/dashboard?upgraded=true`,
    cancel_url: `${origin}/pricing`,
    metadata,
    subscription_data: { metadata },
  });

  return NextResponse.json({ url: session.url });
}
