import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { checkDatabaseConnection } from "@/lib/db";
import { getDownloadLogs } from "@/lib/admin-logs";
import { getRedis, isRedisConfigured } from "@/lib/redis";

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

async function redisServiceCheck(): Promise<ServiceCheck> {
  if (!isRedisConfigured()) {
    return {
      ok: false,
      configured: false,
      required: true,
      message: "Upstash Redis is missing.",
      missing: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"].filter((key) => !process.env[key]),
    };
  }

  try {
    await getRedis().get("ops:health:probe");
    return {
      ok: true,
      configured: true,
      required: true,
      message: "Upstash Redis is configured and reachable.",
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      required: true,
      message: error instanceof Error ? error.message : "Upstash Redis probe failed.",
    };
  }
}

async function downloadLogSummary() {
  try {
    const logs = await getDownloadLogs(50);
    return {
      ok: true,
      total: logs.length,
      success: logs.filter((log) => log.status === "success").length,
      failed: logs.filter((log) => log.status === "failed").length,
      blocked: logs.filter((log) => log.status === "blocked").length,
      latestAt: logs[0]?.createdAt ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      total: 0,
      success: 0,
      failed: 0,
      blocked: 0,
      latestAt: null,
      message: error instanceof Error ? error.message : "Download log summary failed.",
    };
  }
}

export async function GET() {
  const admin = await getAdminUser();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const database = await checkDatabaseConnection();
  const redis = await redisServiceCheck();
  const downloads = await downloadLogSummary();
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
    redis,
    cronMonitor: serviceCheck(["CRON_SECRET"], true, "Scheduled health monitor secret is configured.", "CRON_SECRET is missing."),
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
    downloads.ok && downloads.failed > 0 ? `${downloads.failed} recent failed download${downloads.failed === 1 ? "" : "s"}.` : null,
  ].filter(Boolean);

  const ok = services.database.ok && services.redis.ok && services.cronMonitor.ok && services.stripe.ok && services.clerk.ok;

  return NextResponse.json({
    ok,
    status: ok ? (warnings.length > 0 ? "warn" : "ok") : "fail",
    generatedAt: new Date().toISOString(),
    environment: {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    },
    services,
    downloads,
    warnings,
  });
}
