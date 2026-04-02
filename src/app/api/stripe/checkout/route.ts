import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;

  const origin = req.headers.get("origin") ?? "http://localhost:3000";

  let plan = "pro";
  try {
    const body = await req.json();
    if (body.plan === "business" || body.plan === "pro") {
      plan = body.plan;
    }
  } catch {
    // No body or invalid JSON  -  default to pro
  }

  let priceId: string;
  if (plan === "business") {
    priceId = process.env.STRIPE_BUSINESS_PRICE_ID ?? "";
    if (!priceId) {
      return NextResponse.json(
        { error: "Business plan not yet available" },
        { status: 400 }
      );
    }
  } else {
    priceId = process.env.STRIPE_PRO_PRICE_ID!;
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    customer_email: email ?? undefined,
    success_url: `${origin}/dashboard?upgraded=true`,
    cancel_url: `${origin}/pricing`,
    metadata: {
      userId,
      plan,
    },
  });

  return NextResponse.json({ url: session.url });
}
