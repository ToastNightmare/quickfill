import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getRedis } from "@/lib/redis";
import { APP_CONFIG } from "@/lib/config";

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

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;
  const firstName = user?.firstName ?? "";
  const origin = appOrigin(req);

  let plan: "pro" = "pro";
  let annual = false;
  try {
    const body = await req.json();
    if (body.plan === "pro") plan = "pro";
    if (body.annual === true) annual = true;
  } catch {
    // Default to Pro monthly when no JSON body is supplied.
  }

  const monthlyPriceId = process.env.STRIPE_PRO_PRICE_ID;
  const annualPriceId = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
  const priceId = annual ? annualPriceId : monthlyPriceId;

  if (!priceId) {
    return NextResponse.json(
      { error: annual ? "Annual billing is not configured yet. Please choose monthly." : "Stripe price is not configured." },
      { status: 500 }
    );
  }

  const metadata = { userId, plan, billing: annual ? "annual" : "monthly", firstName };
  const existingCustomerId = await getRedis().get<string>(`stripe_customer:${userId}`);

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
