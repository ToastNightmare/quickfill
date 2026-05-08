import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { isRedisConfigured } from "@/lib/redis";

export async function GET() {
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress;

  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const database = await checkDatabaseConnection();
  return NextResponse.json({
    ok: database.ok,
    services: {
      database,
      redis: { ok: isRedisConfigured(), configured: isRedisConfigured() },
      stripe: { configured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) },
    },
  });
}
