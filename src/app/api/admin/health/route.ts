import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { checkDatabaseConnection } from "@/lib/db";
import { isRedisConfigured } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ServiceCheck = {
  ok: boolean;
  configured: boolean;
  required: boolean;
  message: string;
  missing?: string[];
};

function missingEnv(keys: string[]) {
  return keys.filter((key) => !process.env[key]);
}

function hasEnv(...keys: string[]) {
  return missingEnv(keys).length === 0;
}

function serviceCheck(keys: string[], required: boolean, readyMessage: string, missingMessage: string): ServiceCheck {
  const missing = missingEnv(keys);
  const configured = missing.length === 0;
  return {
    ok: required ? configured : true,
    configured,
    required,
    message: configured ? readyMessage : missingMessage,
    missing,
  };
}

export async function GET() {
  const admin = await getAdminUser();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const database = await checkDatabaseConnection();
  const stripeRequired = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "STRIPE_PRO_PRICE_ID",
    "STRIPE_PRO_ANNUAL_PRICE_ID",
    "STRIPE_BUSINESS_PRICE_ID",
  ];

  const services = {
    database: {
      ok: database.ok,
      configured: hasEnv("DATABASE_URL"),
      required: true,
      message: database.message,
    },
    redis: {
      ok: isRedisConfigured(),
      configured: isRedisConfigured(),
      required: true,
      message: isRedisConfigured() ? "Upstash Redis is configured." : "Upstash Redis is missing.",
    },
    stripe: serviceCheck(stripeRequired, true, "Stripe billing is configured.", "Stripe billing is missing required variables."),
    clerk: serviceCheck(["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"], true, "Clerk authentication is configured.", "Clerk authentication is missing required variables."),
    resend: serviceCheck(["RESEND_API_KEY"], false, "Resend email is configured.", "Resend email is not configured."),
    sentry: {
      ok: true,
      configured: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
      required: false,
      message: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN ? "Sentry is configured." : "Sentry is not configured.",
    },
    openai: serviceCheck(["OPENAI_API_KEY"], false, "OpenAI field detection is configured.", "OpenAI field detection is not configured."),
    abnLookup: serviceCheck(["ABR_GUID"], false, "ABN lookup is configured.", "ABN lookup is not configured."),
    publicApp: {
      ok: true,
      configured: Boolean(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_DOMAIN),
      required: false,
      message: process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_DOMAIN ? "Public app URL/domain is configured." : "Public app URL/domain is not configured.",
    },
  };

  const warnings = [
    !process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID ? "Business annual Stripe price is not configured." : null,
    !services.resend.configured ? "Resend email is not configured." : null,
    !services.sentry.configured ? "Sentry is not configured." : null,
    !services.openai.configured ? "OpenAI field detection is not configured." : null,
  ].filter(Boolean);

  const ok = services.database.ok && services.redis.ok && services.stripe.ok && services.clerk.ok;

  return NextResponse.json({
    ok,
    generatedAt: new Date().toISOString(),
    environment: {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    },
    services,
    warnings,
  });
}
