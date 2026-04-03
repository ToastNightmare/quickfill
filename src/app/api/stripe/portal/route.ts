import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getRedis } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = req.headers.get("origin") ?? "http://localhost:3000";

  // Look up stored customer ID from Redis
  const customerId = await getRedis().get<string>(`stripe_customer:${userId}`);

  if (!customerId) {
    return NextResponse.json({ error: "No subscription found. Please upgrade first." }, { status: 404 });
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
