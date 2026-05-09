const required = [
  ["DATABASE_URL", "Database connection"],
  ["UPSTASH_REDIS_REST_URL", "Redis rate limit URL"],
  ["UPSTASH_REDIS_REST_TOKEN", "Redis rate limit token"],
  ["STRIPE_SECRET_KEY", "Stripe API"],
  ["STRIPE_WEBHOOK_SECRET", "Stripe webhooks"],
  ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "Stripe browser key"],
  ["CLERK_SECRET_KEY", "Clerk server auth"],
  ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "Clerk browser auth"],
  ["CRON_SECRET", "Scheduled production health monitor"],
];

const optional = [
  ["STRIPE_PRO_PRICE_ID", "Pro monthly checkout"],
  ["STRIPE_PRO_ANNUAL_PRICE_ID", "Pro annual checkout"],
  ["STRIPE_BUSINESS_PRICE_ID", "Business monthly checkout"],
  ["STRIPE_BUSINESS_ANNUAL_PRICE_ID", "Business annual checkout"],
  ["RESEND_API_KEY", "Operational email alerts"],
  ["QUICKFILL_ALERT_EMAILS", "Health-check alert recipients"],
  ["SENTRY_DSN", "Server error reporting"],
  ["NEXT_PUBLIC_SENTRY_DSN", "Browser error reporting"],
  ["OPENAI_API_KEY", "Future AI-assisted workflows"],
  ["QUICKFILL_MONITOR_BASE_URL", "Health monitor target site override"],
  ["QUICKFILL_MONITOR_PATHS", "Extra public health monitor paths"],
];

function summarize(entries) {
  return entries.map(([key, label]) => ({ key, label, configured: Boolean(process.env[key]) }));
}

const requiredChecks = summarize(required);
const optionalChecks = summarize(optional);
const missingRequired = requiredChecks.filter((check) => !check.configured);
const missingOptional = optionalChecks.filter((check) => !check.configured);

const recommendations = [];
if (missingRequired.length > 0) {
  recommendations.push("Add missing required environment variables before relying on production automation.");
}
if (missingOptional.some((check) => check.key === "STRIPE_BUSINESS_ANNUAL_PRICE_ID")) {
  recommendations.push("Add the Business annual Stripe price before showing annual Business checkout.");
}
if (missingOptional.some((check) => check.key === "QUICKFILL_ALERT_EMAILS")) {
  recommendations.push("Add QUICKFILL_ALERT_EMAILS so failed health checks notify a real inbox.");
}
if (missingOptional.some((check) => check.key === "SENTRY_DSN" || check.key === "NEXT_PUBLIC_SENTRY_DSN")) {
  recommendations.push("Keep Sentry configured in Production and Preview for release debugging.");
}
if (missingOptional.some((check) => check.key === "QUICKFILL_MONITOR_PATHS")) {
  recommendations.push("Set QUICKFILL_MONITOR_PATHS to /,/pricing once CRON_SECRET is live.");
}

console.log(
  JSON.stringify(
    {
      ok: missingRequired.length === 0,
      generatedAt: new Date().toISOString(),
      required: requiredChecks,
      optional: optionalChecks,
      recommendations,
    },
    null,
    2,
  ),
);

if (missingRequired.length > 0 && process.argv.includes("--strict")) {
  process.exitCode = 1;
}
