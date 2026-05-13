import type Stripe from "stripe";
import { isDatabaseConfigured, query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import {
  isSubscriptionEntitled,
  saveSubscriptionSnapshot,
  tierFromPriceId,
  type QuickFillTier,
} from "@/lib/billing-store";

export const BILLING_RECONCILIATION_DEFAULT_LIMIT = 50;
export const BILLING_RECONCILIATION_MAX_LIMIT = 100;

type SubscriptionCandidate = {
  user_id: string | null;
  tier: QuickFillTier | null;
  status: string | null;
  current_period_end: Date | string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  updated_at: Date | string | null;
};

type ReconciliationError = {
  userId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  message: string;
};

export type BillingReconciliationResult = {
  ok: boolean;
  checked: number;
  updated: number;
  downgraded: number;
  skipped: number;
  errors: ReconciliationError[];
  message: string;
};

function clampLimit(limit?: number) {
  if (!Number.isFinite(limit)) return BILLING_RECONCILIATION_DEFAULT_LIMIT;
  const whole = Math.trunc(limit ?? BILLING_RECONCILIATION_DEFAULT_LIMIT);
  return Math.min(Math.max(whole, 1), BILLING_RECONCILIATION_MAX_LIMIT);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  return (subscription as unknown as { current_period_end?: number | null }).current_period_end ?? null;
}

export function subscriptionTier(subscription: Stripe.Subscription, fallback: QuickFillTier = "pro"): QuickFillTier {
  const metadataTier = subscription.metadata?.plan;
  if (metadataTier === "pro" || metadataTier === "business") return metadataTier;

  const priceId = subscription.items.data[0]?.price?.id;
  return tierFromPriceId(priceId) ?? fallback;
}

async function fetchCurrentSubscription(candidate: SubscriptionCandidate) {
  const stripe = getStripe();

  if (candidate.stripe_subscription_id) {
    return stripe.subscriptions.retrieve(candidate.stripe_subscription_id);
  }

  if (!candidate.stripe_customer_id) return null;

  const subscriptions = await stripe.subscriptions.list({
    customer: candidate.stripe_customer_id,
    status: "all",
    limit: 10,
  });

  return subscriptions.data.sort((a, b) => b.created - a.created)[0] ?? null;
}

export async function reconcileStripeBilling(options: { limit?: number } = {}): Promise<BillingReconciliationResult> {
  const limit = clampLimit(options.limit);
  const result: BillingReconciliationResult = {
    ok: true,
    checked: 0,
    updated: 0,
    downgraded: 0,
    skipped: 0,
    errors: [],
    message: "Billing reconciliation completed.",
  };

  if (!isDatabaseConfigured()) {
    return {
      ...result,
      ok: false,
      message: "DATABASE_URL is not configured; billing reconciliation cannot run.",
    };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      ...result,
      ok: false,
      message: "STRIPE_SECRET_KEY is not configured; billing reconciliation cannot run.",
    };
  }

  const candidates = await query<SubscriptionCandidate>(
    `select user_id, tier, status, current_period_end, stripe_customer_id, stripe_subscription_id, updated_at
     from subscriptions
     where stripe_subscription_id is not null or stripe_customer_id is not null
     order by updated_at asc nulls first
     limit $1`,
    [limit],
  );

  result.checked = candidates.length;

  for (const candidate of candidates) {
    if (!candidate.user_id) {
      result.skipped += 1;
      result.errors.push({
        userId: null,
        stripeCustomerId: candidate.stripe_customer_id,
        stripeSubscriptionId: candidate.stripe_subscription_id,
        message: "Subscription row has no QuickFill user ID.",
      });
      continue;
    }

    try {
      const subscription = await fetchCurrentSubscription(candidate);
      if (!subscription) {
        result.skipped += 1;
        result.errors.push({
          userId: candidate.user_id,
          stripeCustomerId: candidate.stripe_customer_id,
          stripeSubscriptionId: candidate.stripe_subscription_id,
          message: "No Stripe subscription found for stored billing record.",
        });
        continue;
      }

      const customerId = subscription.customer ? String(subscription.customer) : candidate.stripe_customer_id;
      const periodEnd = subscriptionPeriodEnd(subscription);
      const tier = subscriptionTier(subscription, candidate.tier ?? "pro");

      await saveSubscriptionSnapshot({
        userId: candidate.user_id,
        customerId,
        subscriptionId: subscription.id,
        tier,
        status: subscription.status,
        currentPeriodEnd: periodEnd,
      });

      result.updated += 1;
      if (!isSubscriptionEntitled(subscription.status, periodEnd)) {
        result.downgraded += 1;
      }
    } catch (error) {
      result.skipped += 1;
      result.errors.push({
        userId: candidate.user_id,
        stripeCustomerId: candidate.stripe_customer_id,
        stripeSubscriptionId: candidate.stripe_subscription_id,
        message: errorMessage(error),
      });
    }
  }

  if (result.errors.length > 0) {
    result.ok = false;
    result.message = "Billing reconciliation completed with records that need review.";
  }

  return result;
}
