import type Stripe from "stripe";
import { isDatabaseConfigured, query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import {
  isSubscriptionEntitled,
  saveSubscriptionSnapshot,
  stripeSubscriptionPeriodEnd,
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

type BillingReconciliationForUserOptions = {
  email?: string | null;
  sessionId?: string | null;
};

const LIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing"]);

function clampLimit(limit?: number) {
  if (!Number.isFinite(limit)) return BILLING_RECONCILIATION_DEFAULT_LIMIT;
  const whole = Math.trunc(limit ?? BILLING_RECONCILIATION_DEFAULT_LIMIT);
  return Math.min(Math.max(whole, 1), BILLING_RECONCILIATION_MAX_LIMIT);
}

function createResult(message = "Billing reconciliation completed."): BillingReconciliationResult {
  return {
    ok: true,
    checked: 0,
    updated: 0,
    downgraded: 0,
    skipped: 0,
    errors: [],
    message,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function requiredConfigError(result: BillingReconciliationResult) {
  if (!isDatabaseConfigured()) {
    return {
      ...result,
      ok: false,
      message: "DATABASE_URL is not configured; billing reconciliation cannot run.",
    } satisfies BillingReconciliationResult;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      ...result,
      ok: false,
      message: "STRIPE_SECRET_KEY is not configured; billing reconciliation cannot run.",
    } satisfies BillingReconciliationResult;
  }

  return null;
}

export function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  return stripeSubscriptionPeriodEnd(subscription);
}

export function subscriptionTier(subscription: Stripe.Subscription, fallback: QuickFillTier = "pro"): QuickFillTier {
  const metadataTier = subscription.metadata?.plan;
  if (metadataTier === "pro" || metadataTier === "business") return metadataTier;

  const priceId = subscription.items.data[0]?.price?.id;
  return tierFromPriceId(priceId) ?? fallback;
}

function newestSubscription(subscriptions: Stripe.Subscription[]) {
  return subscriptions.sort((a, b) => b.created - a.created)[0] ?? null;
}

function bestCustomerSubscription(subscriptions: Stripe.Subscription[]) {
  const live = subscriptions.filter((subscription) => LIVE_SUBSCRIPTION_STATUSES.has(subscription.status));
  return newestSubscription(live) ?? newestSubscription(subscriptions);
}

function objectId(value: string | { id?: string } | null | undefined) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.id === "string") return value.id;
  return null;
}

function safeCheckoutSessionId(sessionId?: string | null) {
  const value = sessionId?.trim();
  if (!value || !value.startsWith("cs_")) return null;
  return value;
}

async function listCustomerSubscriptions(customerId: string) {
  const subscriptions = await getStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  return subscriptions.data;
}

async function fetchCurrentSubscription(candidate: SubscriptionCandidate) {
  const stripe = getStripe();
  let storedSubscription: Stripe.Subscription | null = null;

  if (candidate.stripe_subscription_id) {
    storedSubscription = await stripe.subscriptions.retrieve(candidate.stripe_subscription_id);
  }

  if (!candidate.stripe_customer_id) return storedSubscription;

  const customerSubscriptions = await listCustomerSubscriptions(candidate.stripe_customer_id);
  const bestCustomerMatch = bestCustomerSubscription(customerSubscriptions);
  if (!bestCustomerMatch) return storedSubscription;

  if (!storedSubscription) return bestCustomerMatch;
  if (LIVE_SUBSCRIPTION_STATUSES.has(bestCustomerMatch.status) && !LIVE_SUBSCRIPTION_STATUSES.has(storedSubscription.status)) {
    return bestCustomerMatch;
  }
  if (bestCustomerMatch.created > storedSubscription.created && LIVE_SUBSCRIPTION_STATUSES.has(bestCustomerMatch.status)) {
    return bestCustomerMatch;
  }

  return storedSubscription;
}

async function stripeCustomerCandidateFromCheckoutSession(
  userId: string,
  sessionId?: string | null,
): Promise<SubscriptionCandidate | null> {
  const checkoutSessionId = safeCheckoutSessionId(sessionId);
  if (!checkoutSessionId) return null;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
    expand: ["subscription"],
  });

  if (session.mode !== "subscription") {
    throw new Error("Checkout session is not a subscription checkout.");
  }

  const expandedSubscription =
    typeof session.subscription === "object" && session.subscription && "id" in session.subscription
      ? (session.subscription as Stripe.Subscription)
      : null;
  const subscription = expandedSubscription
    ?? (typeof session.subscription === "string" ? await stripe.subscriptions.retrieve(session.subscription) : null);

  if (!subscription) {
    throw new Error("Checkout session has no subscription yet.");
  }

  const sessionUserId = session.metadata?.userId ?? null;
  const subscriptionUserId = subscription.metadata?.userId ?? null;
  if (sessionUserId && sessionUserId !== userId && subscriptionUserId !== userId) {
    throw new Error("Checkout session belongs to a different QuickFill user.");
  }

  const metadataTier = session.metadata?.plan === "business" ? "business" : session.metadata?.plan === "pro" ? "pro" : null;
  const customerId = objectId(subscription.customer) ?? objectId(session.customer);

  return {
    user_id: userId,
    tier: metadataTier ?? subscriptionTier(subscription),
    status: subscription.status,
    current_period_end: null,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    updated_at: null,
  };
}

async function stripeCustomerCandidateFromEmail(userId: string, email?: string | null): Promise<SubscriptionCandidate | null> {
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail) return null;

  const customers = await getStripe().customers.list({ email: cleanEmail, limit: 10 });
  if (customers.data.length === 0) return null;

  let fallback: SubscriptionCandidate | null = null;

  for (const customer of customers.data) {
    const candidate: SubscriptionCandidate = {
      user_id: userId,
      tier: null,
      status: null,
      current_period_end: null,
      stripe_customer_id: customer.id,
      stripe_subscription_id: null,
      updated_at: null,
    };

    fallback ??= candidate;

    const subscription = bestCustomerSubscription(await listCustomerSubscriptions(customer.id));
    if (!subscription) continue;

    const subscriptionCandidate = {
      ...candidate,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
    };

    if (LIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) return subscriptionCandidate;
    fallback = subscriptionCandidate;
  }

  return fallback;
}

async function reconcileCandidate(candidate: SubscriptionCandidate, result: BillingReconciliationResult) {
  if (!candidate.user_id) {
    result.skipped += 1;
    result.errors.push({
      userId: null,
      stripeCustomerId: candidate.stripe_customer_id,
      stripeSubscriptionId: candidate.stripe_subscription_id,
      message: "Subscription row has no QuickFill user ID.",
    });
    return;
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
      return;
    }

    const customerId = objectId(subscription.customer) ?? candidate.stripe_customer_id;
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

function finalizeResult(result: BillingReconciliationResult) {
  if (result.errors.length > 0) {
    result.ok = false;
    result.message = "Billing reconciliation completed with records that need review.";
  }

  return result;
}

export async function reconcileStripeBilling(options: { limit?: number } = {}): Promise<BillingReconciliationResult> {
  const limit = clampLimit(options.limit);
  const result = createResult();
  const configError = requiredConfigError(result);
  if (configError) return configError;

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
    await reconcileCandidate(candidate, result);
  }

  return finalizeResult(result);
}

export async function reconcileStripeBillingForUser(
  userId: string,
  options: BillingReconciliationForUserOptions = {},
): Promise<BillingReconciliationResult> {
  const result = createResult("Customer billing record synced from Stripe.");
  const configError = requiredConfigError(result);
  if (configError) return configError;

  let sessionCandidate: SubscriptionCandidate | null = null;
  try {
    sessionCandidate = await stripeCustomerCandidateFromCheckoutSession(userId, options.sessionId);
  } catch (error) {
    result.errors.push({
      userId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      message: errorMessage(error),
    });
  }

  let candidates: SubscriptionCandidate[] = [];
  if (!sessionCandidate) {
    try {
      candidates = await query<SubscriptionCandidate>(
        `select user_id, tier, status, current_period_end, stripe_customer_id, stripe_subscription_id, updated_at
         from subscriptions
         where user_id = $1 and (stripe_subscription_id is not null or stripe_customer_id is not null)
         order by updated_at desc nulls last
         limit 1`,
        [userId],
      );
    } catch (error) {
      result.errors.push({
        userId,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        message: errorMessage(error),
      });
    }
  }

  const emailCandidate = sessionCandidate || candidates[0] ? null : await stripeCustomerCandidateFromEmail(userId, options.email);
  const candidate = sessionCandidate ?? candidates[0] ?? emailCandidate;
  if (!candidate) {
    return finalizeResult({
      ...result,
      ok: false,
      skipped: 1,
      message: options.email
        ? "No stored billing record or Stripe customer found for this user."
        : "No stored billing record found for this user.",
    });
  }

  result.checked = 1;
  await reconcileCandidate(candidate, result);
  return finalizeResult(result);
}
