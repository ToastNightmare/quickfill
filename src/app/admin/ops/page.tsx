import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  Database,
  Gauge,
  KeyRound,
  Mail,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { requireAdminUser } from "@/lib/admin-routing";
import { checkDatabaseConnection, isDatabaseConfigured, query } from "@/lib/db";
import { isRedisConfigured } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Ops Health | QuickFill Admin",
  robots: {
    index: false,
    follow: false,
  },
};

type ServiceStatus = "ok" | "warn" | "fail";

type ServiceCard = {
  name: string;
  status: ServiceStatus;
  detail: string;
  items: string[];
  icon: typeof ServerCog;
};

type BillingSyncAudit = {
  ok?: boolean;
  checked?: number;
  updated?: number;
  downgraded?: number;
  skipped?: number;
  message?: string;
  completedAt?: string;
  errors?: unknown[];
};

type BillingSyncSnapshot = {
  ok: boolean;
  checked: number;
  updated: number;
  downgraded: number;
  skipped: number;
  errorCount: number;
  message: string;
  completedAt: string | null;
};

function hasEnv(...keys: string[]) {
  return keys.every((key) => Boolean(process.env[key]));
}

function hasAnyEnv(...keys: string[]) {
  return keys.some((key) => Boolean(process.env[key]));
}

function formatCommit() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const message = process.env.VERCEL_GIT_COMMIT_MESSAGE;
  if (!sha && !message) return "Commit metadata is not available outside Vercel.";
  return [sha, message].filter(Boolean).join(" - ");
}

function formatDateTime(value: string | null) {
  if (!value) return "time not recorded";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time not recorded";

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Perth",
  }).format(date);
}

function normalizeBillingSyncMetadata(metadata: BillingSyncAudit | string | null | undefined): BillingSyncAudit {
  if (!metadata) return {};
  if (typeof metadata !== "string") return metadata;

  try {
    return JSON.parse(metadata) as BillingSyncAudit;
  } catch {
    return { message: metadata };
  }
}

async function loadLatestBillingSync(): Promise<BillingSyncSnapshot | null> {
  if (!isDatabaseConfigured()) return null;

  try {
    const rows = await query<{
      event_type: string;
      metadata: BillingSyncAudit | string | null;
      created_at: Date | string | null;
    }>(
      "select event_type, metadata, created_at from audit_events where event_type in ($1, $2) order by created_at desc limit 1",
      ["billing_sync_ok", "billing_sync_failed"],
    );
    const row = rows[0];
    if (!row) return null;

    const metadata = normalizeBillingSyncMetadata(row.metadata);
    const completedAt =
      metadata.completedAt ??
      (row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at ? String(row.created_at) : null);

    return {
      ok: Boolean(metadata.ok),
      checked: Number(metadata.checked ?? 0),
      updated: Number(metadata.updated ?? 0),
      downgraded: Number(metadata.downgraded ?? 0),
      skipped: Number(metadata.skipped ?? 0),
      errorCount: Array.isArray(metadata.errors) ? metadata.errors.length : 0,
      message: metadata.message ?? (row.event_type === "billing_sync_ok" ? "Billing sync completed." : "Billing sync needs review."),
      completedAt,
    };
  } catch {
    return null;
  }
}

function statusClass(status: ServiceStatus) {
  if (status === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "warn") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function statusIcon(status: ServiceStatus) {
  if (status === "ok") return CheckCircle2;
  if (status === "warn") return AlertTriangle;
  return CircleHelp;
}

function StatusBadge({ status }: { status: ServiceStatus }) {
  const Icon = statusIcon(status);
  const label = status === "ok" ? "Ready" : status === "warn" ? "Check" : "Needs fix";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function OpsCard({ service }: { service: ServiceCard }) {
  const Icon = service.icon;
  return (
    <article className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold">{service.name}</h2>
            <p className="mt-1 text-sm text-text-muted">{service.detail}</p>
          </div>
        </div>
        <StatusBadge status={service.status} />
      </div>
      <ul className="mt-4 space-y-2 text-sm text-text-muted">
        {service.items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default async function AdminOpsPage() {
  await requireAdminUser();

  const database = await checkDatabaseConnection();
  const billingSync = await loadLatestBillingSync();
  const redisReady = isRedisConfigured();
  const cronReady = hasEnv("CRON_SECRET");
  const stripeCoreReady = hasEnv(
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "STRIPE_PRO_PRICE_ID",
    "STRIPE_PRO_ANNUAL_PRICE_ID",
    "STRIPE_BUSINESS_PRICE_ID",
  );
  const businessAnnualReady = hasEnv("STRIPE_BUSINESS_ANNUAL_PRICE_ID");
  const clerkReady = hasEnv("CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const emailReady = hasEnv("RESEND_API_KEY");
  const alertReady = hasAnyEnv("QUICKFILL_ALERT_EMAILS", "QUICKFILL_ADMIN_EMAILS");
  const appUrlReady = hasAnyEnv("NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_APP_DOMAIN");

  const services: ServiceCard[] = [
    {
      name: "Production deploy",
      status: process.env.VERCEL_ENV === "production" ? "ok" : "warn",
      detail: process.env.VERCEL_ENV ? `Running in ${process.env.VERCEL_ENV}.` : "Vercel environment metadata is not set locally.",
      icon: ServerCog,
      items: [formatCommit(), "After each deploy, confirm the Vercel deployment is Ready and the public homepage loads."],
    },
    {
      name: "Scheduled monitor",
      status: cronReady ? "ok" : "fail",
      detail: cronReady ? "Cron secret is configured." : "CRON_SECRET is missing.",
      icon: ServerCog,
      items: [
        cronReady ? "CRON_SECRET is configured for authorized monitor requests." : "Add CRON_SECRET so scheduled monitor requests can authenticate.",
        "Vercel runs /api/cron/health-check daily on the current Hobby plan.",
        "The monitor records audit events and checks the homepage, database, Redis, Stripe, and Clerk.",
        alertReady ? "Alert recipients are configured." : "Add QUICKFILL_ALERT_EMAILS to send failure alerts.",
      ],
    },
    {
      name: "Database",
      status: database.ok ? "ok" : "fail",
      detail: database.message,
      icon: Database,
      items: ["Neon Postgres stores users, subscriptions, usage, Stripe events, and audit events.", "If this fails, billing state and usage tracking cannot be trusted."],
    },
    {
      name: "Redis rate limits",
      status: redisReady ? "ok" : "fail",
      detail: redisReady ? "Upstash Redis is configured." : "Upstash Redis environment variables are missing.",
      icon: Gauge,
      items: ["Redis protects checkout, uploads, and public endpoints from abuse.", "Keep this enabled before heavier marketing or customer onboarding."],
    },
    {
      name: "Stripe billing",
      status: stripeCoreReady && businessAnnualReady ? "ok" : stripeCoreReady ? "warn" : "fail",
      detail: stripeCoreReady ? "Core billing variables are configured." : "One or more required Stripe variables are missing.",
      icon: KeyRound,
      items: [
        "Pro monthly, Pro annual, and Business monthly are required for the public checkout path.",
        businessAnnualReady ? "Business annual pricing is configured." : "Business annual pricing is not configured yet; add it or keep annual Business hidden.",
        "Webhook delivery should be checked after every billing change.",
      ],
    },
    {
      name: "Billing sync",
      status: !cronReady ? "fail" : billingSync ? (billingSync.ok ? "ok" : "fail") : "warn",
      detail: !cronReady
        ? "CRON_SECRET is required before billing sync can run."
        : billingSync
          ? billingSync.message
          : "Billing sync is scheduled but has not recorded a run yet.",
      icon: KeyRound,
      items: [
        "Runs daily to repair missed Stripe webhook state and stale access.",
        billingSync ? `Last run: ${formatDateTime(billingSync.completedAt)}.` : "The first recorded result will appear after the next scheduled run.",
        billingSync
          ? `Checked ${billingSync.checked}, updated ${billingSync.updated}, downgraded ${billingSync.downgraded}, skipped ${billingSync.skipped}, errors ${billingSync.errorCount}.`
          : "Use the protected cron endpoint for manual checks when needed.",
      ],
    },
    {
      name: "Clerk access",
      status: clerkReady ? "ok" : "fail",
      detail: clerkReady ? "Authentication variables are configured." : "Clerk variables are missing.",
      icon: ShieldCheck,
      items: ["Admin access uses Clerk identity plus QuickFill admin rules.", "Keep QUICKFILL_ADMIN_EMAILS updated for owner and support accounts."],
    },
    {
      name: "Email and alerts",
      status: emailReady && alertReady ? "ok" : emailReady ? "warn" : "warn",
      detail: emailReady ? "Resend is configured." : "Resend is not configured.",
      icon: Mail,
      items: ["Email is used for billing and support notifications.", alertReady ? "Alert recipients are configured." : "Add QUICKFILL_ALERT_EMAILS for monitor alerts.", "Sentry is optional but recommended for production error visibility."],
    },
    {
      name: "Public app settings",
      status: appUrlReady ? "ok" : "warn",
      detail: appUrlReady ? "Public app URL/domain variables are configured." : "Public app URL/domain variables are missing.",
      icon: ServerCog,
      items: ["Use getquickfill.com as the canonical production domain.", "Enable Vercel Web Analytics and Speed Insights from the Vercel dashboard."],
    },
  ];

  const blockers = services.filter((service) => service.status === "fail").length;
  const warnings = services.filter((service) => service.status === "warn").length;

  return (
    <div className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Admin home
        </Link>

        <div className="mt-6 flex flex-col justify-between gap-4 border-b border-border pb-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold text-accent">Operations</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">QuickFill ops health</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              A private readiness check for the systems QuickFill depends on before and after production releases.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            <p className="font-semibold">{blockers === 0 ? "No blockers detected" : `${blockers} blocker${blockers === 1 ? "" : "s"}`}</p>
            <p className="mt-1 text-text-muted">{warnings} warning{warnings === 1 ? "" : "s"} to review</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {services.map((service) => (
            <OpsCard key={service.name} service={service} />
          ))}
        </div>

        <section className="mt-8 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="font-semibold">Release checklist</h2>
          <div className="mt-4 grid gap-3 text-sm text-text-muted md:grid-cols-2">
            <p>Visit the homepage, pricing page, sign-in, dashboard, editor, and checkout start after every production deploy.</p>
            <p>Review Vercel runtime logs, Stripe webhook delivery, and admin analytics before calling a release complete.</p>
            <p>Run a real PDF upload/fill/download smoke test before paid traffic or public announcements.</p>
            <p>Keep the database, Redis, Stripe, Clerk, and monitor checks green before scaling toward high user volume.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
