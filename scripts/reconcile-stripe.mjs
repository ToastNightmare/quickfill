import Stripe from "stripe";

const strict = process.argv.includes("--strict");
const maxArg = process.argv.find((arg) => arg.startsWith("--max="));
const maxSubscriptions = maxArg ? Number(maxArg.slice("--max=".length)) : 500;

if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });

const priceTiers = new Map(
  [
    [process.env.STRIPE_PRO_PRICE_ID, "pro"],
    [process.env.STRIPE_PRO_ANNUAL_PRICE_ID, "pro"],
    [process.env.STRIPE_BUSINESS_PRICE_ID, "business"],
    [process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID, "business"],
  ].filter(([priceId]) => Boolean(priceId)),
);

async function listStripeSubscriptions() {
  const subscriptions = [];
  await stripe.subscriptions.list({ status: "all", limit: 100 }).autoPagingEach((subscription) => {
    subscriptions.push(subscription);
    return subscriptions.length < maxSubscriptions;
  });
  return subscriptions;
}

async function listStoredSubscriptions() {
  if (!process.env.DATABASE_URL) {
    return { skipped: true, rows: [] };
  }

  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    select
      user_id,
      stripe_customer_id,
      stripe_subscription_id,
      tier,
      status,
      current_period_end,
      updated_at
    from subscriptions
    order by updated_at desc
  `;

  return { skipped: false, rows };
}

function stripeTier(subscription) {
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  return priceId ? (priceTiers.get(priceId) ?? "unknown") : "unknown";
}

function stripeCustomerId(subscription) {
  return typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null;
}

const [products, prices, stripeSubscriptions, storedResult] = await Promise.all([
  stripe.products.list({ limit: 20, active: true }),
  stripe.prices.list({ limit: 50, active: true }),
  listStripeSubscriptions(),
  listStoredSubscriptions(),
]);

const storedBySubscriptionId = new Map(
  storedResult.rows
    .filter((row) => row.stripe_subscription_id)
    .map((row) => [row.stripe_subscription_id, row]),
);
const stripeBySubscriptionId = new Map(stripeSubscriptions.map((subscription) => [subscription.id, subscription]));
const mismatches = [];

for (const subscription of stripeSubscriptions) {
  const stored = storedBySubscriptionId.get(subscription.id);
  const expectedTier = stripeTier(subscription);
  const activeInStripe = ["active", "trialing"].includes(subscription.status);

  if (activeInStripe && !stored) {
    mismatches.push({
      type: "missing_stored_subscription",
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: stripeCustomerId(subscription),
      stripeStatus: subscription.status,
      expectedTier,
    });
    continue;
  }

  if (!stored) continue;

  if (stored.status !== subscription.status) {
    mismatches.push({
      type: "status_mismatch",
      stripeSubscriptionId: subscription.id,
      storedStatus: stored.status,
      stripeStatus: subscription.status,
      userId: stored.user_id,
    });
  }

  if (expectedTier !== "unknown" && stored.tier !== expectedTier) {
    mismatches.push({
      type: "tier_mismatch",
      stripeSubscriptionId: subscription.id,
      storedTier: stored.tier,
      expectedTier,
      priceId: subscription.items?.data?.[0]?.price?.id ?? null,
      userId: stored.user_id,
    });
  }
}

for (const row of storedResult.rows) {
  const activeStored = ["active", "trialing"].includes(row.status);
  if (activeStored && row.stripe_subscription_id && !stripeBySubscriptionId.has(row.stripe_subscription_id)) {
    mismatches.push({
      type: "stored_subscription_not_found_in_stripe",
      stripeSubscriptionId: row.stripe_subscription_id,
      storedStatus: row.status,
      storedTier: row.tier,
      userId: row.user_id,
    });
  }
}

const report = {
  ok: mismatches.length === 0,
  generatedAt: new Date().toISOString(),
  catalog: {
    activeProducts: products.data.map((product) => ({ id: product.id, name: product.name })),
    activePrices: prices.data.map((price) => ({
      id: price.id,
      product: typeof price.product === "string" ? price.product : price.product?.id,
      currency: price.currency,
      unitAmount: price.unit_amount,
      recurring: price.recurring ? { interval: price.recurring.interval, intervalCount: price.recurring.interval_count } : null,
      mappedTier: priceTiers.get(price.id) ?? null,
    })),
  },
  subscriptions: {
    stripeScanned: stripeSubscriptions.length,
    storedScanned: storedResult.rows.length,
    databaseSkipped: storedResult.skipped,
    maxSubscriptions,
  },
  mismatches,
};

console.log(JSON.stringify(report, null, 2));

if (strict && mismatches.length > 0) {
  process.exitCode = 1;
}
