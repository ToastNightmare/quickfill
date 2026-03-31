import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = req.headers.get("origin") ?? "http://localhost:3000";

  // Find the customer by metadata
  const customers = await getStripe().customers.list({
    limit: 1,
    expand: ["data.subscriptions"],
  });

  const customer = customers.data.find((c) =>
    c.metadata?.userId === userId
  );

  if (!customer) {
    return NextResponse.json({ error: "No subscription found" }, { status: 404 });
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: customer.id,
    return_url: `${origin}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
