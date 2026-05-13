import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { checkDatabaseConnection, isDatabaseConfigured, query } from "@/lib/db";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckStatus = "ok" | "warn" | "fail";

type HealthCheck = {
  name: string;
  status: CheckStatus;
  required: boolean;
  message: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

type HealthReport = {
  ok: boolean;
  generatedAt: string;
  environment: {
    vercelEnv: string | null;
    commit: string | null;
  };
  checks: HealthCheck[];
  alert: {
    attempted: boolean;
    sent: boolean;
    reason?: string;
  };
};

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function requiredEnvCheck(name: string, keys: string[], message: string): HealthCheck {
  const missing = keys.filter((key) => !process.env[key]);
  return {
    name,
    status: missing.length === 0 ? "ok" : "fail",
    required: true,
    message: missing.length === 0 ? message : `Missing ${missing.join(", ")}.`,
    metadata: missing.length > 0 ? { missing } : undefined,
  };
}

function optionalEnvCheck(name: string, keys: string[], message: string): HealthCheck {
  const configured = keys.some((key) => Boolean(process.env[key]));
  return {
    name,
    status: configured ? "ok" : "warn",
    required: false,
    message: configured ? message : `Optional setting missing: ${keys.join(" or ")}.`,
  };
}

function parseCsv(value?: string) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function baseUrlFromRequest(request: NextRequest) {
  const configured = process.env.QUICKFILL_MONITOR_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return request.nextUrl.origin.replace(/\/$/, "");
}

function smokePaths() {
  const configured = parseCsv(process.env.QUICKFILL_MONITOR_PATHS);
  return configured.length > 0 ? configured : ["/"];
}

async function checkPublicUrl(baseUrl: string, path: string): Promise<HealthCheck> {
  const startedAt = Date.now();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      headers: {
        "user-agent": "QuickFill production health monitor",
      },
    });

    return {
      name: `public:${path}`,
      status: response.ok ? "ok" : "fail",
      required: true,
      message: response.ok ? `${path} responded with ${response.status}.` : `${path} responded with ${response.status}.`,
      durationMs: Date.now() - startedAt,
      metadata: { status: response.status, url },
    };
  } catch (error) {
    return {
      name: `public:${path}`,
      status: "fail",
      required: true,
      message: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
      metadata: { url },
    };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  if (!isRedisConfigured()) {
    return {
      name: "redis",
      status: "fail",
      required: true,
      message: "Upstash Redis environment variables are missing.",
    };
  }

  const startedAt = Date.now();
  try {
    await getRedis().get("ops:health:probe");
    return {
      name: "redis",
      status: "ok",
      required: true,
      message: "Upstash Redis responded.",
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      name: "redis",
      status: "fail",
      required: true,
      message: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

async function recordAuditEvent(report: Omit<HealthReport, "alert">) {
  if (!isDatabaseConfigured()) return;

  try {
    await query("insert into audit_events (event_type, metadata) values ($1, $2::jsonb)", [
      report.ok ? "ops_health_check_ok" : "ops_health_check_failed",
      JSON.stringify(report),
    ]);
  } catch (error) {
    console.error("Failed to record ops health check", error);
  }
}

function failureSignature(checks: HealthCheck[]) {
  return checks
    .filter((check) => check.required && check.status === "fail")
    .map((check) => `${check.name}:${check.message}`)
    .sort()
    .join("|");
}

async function sendAlertIfNeeded(report: Omit<HealthReport, "alert">) {
  const recipients = parseCsv(process.env.QUICKFILL_ALERT_EMAILS || process.env.QUICKFILL_ADMIN_EMAILS);
  const from = process.env.QUICKFILL_ALERT_FROM || "QuickFill <alerts@getquickfill.com>";
  const signature = failureSignature(report.checks);

  if (!signature) return { attempted: false, sent: false, reason: "No failed required checks." };
  if (!process.env.RESEND_API_KEY) return { attempted: false, sent: false, reason: "RESEND_API_KEY is not configured." };
  if (recipients.length === 0) return { attempted: false, sent: false, reason: "No alert recipients configured." };

  try {
    if (isRedisConfigured()) {
      const redis = getRedis();
      const previous = await redis.get<string>("ops:health:last-alert-signature");
      if (previous === signature) {
        return { attempted: false, sent: false, reason: "Same failure already alerted." };
      }
      await redis.set("ops:health:last-alert-signature", signature, { ex: 60 * 60 * 6 });
    }

    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const failed = report.checks.filter((check) => check.required && check.status === "fail");
    const text = [
      "QuickFill production health check failed.",
      `Generated at: ${report.generatedAt}`,
      `Environment: ${report.environment.vercelEnv ?? "unknown"}`,
      `Commit: ${report.environment.commit ?? "unknown"}`,
      "",
      ...failed.map((check) => `- ${check.name}: ${check.message}`),
    ].join("\n");

    await resend.emails.send({
      from,
      to: recipients,
      subject: "QuickFill production health check failed",
      text,
    });

    return { attempted: true, sent: true };
  } catch (error) {
    return {
      attempted: true,
      sent: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return unauthorized();
  }

  const baseUrl = baseUrlFromRequest(request);
  const database = await checkDatabaseConnection();
  const checks: HealthCheck[] = [
    {
      name: "database",
      status: database.ok ? "ok" : "fail",
      required: true,
      message: database.message,
    },
    await checkRedis(),
    requiredEnvCheck(
      "stripe",
      [
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
        "STRIPE_PRO_PRICE_ID",
        "STRIPE_PRO_ANNUAL_PRICE_ID",
        "STRIPE_BUSINESS_PRICE_ID",
      ],
      "Stripe billing variables are configured.",
    ),
    requiredEnvCheck("clerk", ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"], "Clerk authentication variables are configured."),
    optionalEnvCheck("businessAnnualStripe", ["STRIPE_BUSINESS_ANNUAL_PRICE_ID"], "Business annual Stripe price is configured."),
    optionalEnvCheck("email", ["RESEND_API_KEY"], "Resend email is configured."),
    optionalEnvCheck("sentry", ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"], "Sentry is configured."),
  ];

  const publicChecks = await Promise.all(smokePaths().map((path) => checkPublicUrl(baseUrl, path)));
  checks.push(...publicChecks);

  const ok = checks.every((check) => !check.required || check.status !== "fail");
  const reportWithoutAlert = {
    ok,
    generatedAt: new Date().toISOString(),
    environment: {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    checks,
  };

  await recordAuditEvent(reportWithoutAlert);
  const alert = ok ? { attempted: false, sent: false, reason: "Health check passed." } : await sendAlertIfNeeded(reportWithoutAlert);
  const report: HealthReport = { ...reportWithoutAlert, alert };

  return NextResponse.json(report, { status: ok ? 200 : 500 });
}
