import type Stripe from "stripe";
import { isDatabaseConfigured, query } from "@/lib/db";
import { getRedis, isRedisConfigured } from "@/lib/redis";
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
const STRIPE_ORPHAN_SCAN_LIMIT = 100;
const REDIS_CUSTOMER_SCAN_LIMIT = 100;

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

function stripeConfigError(result: BillingReconciliationResult) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      ...result,
      ok: false,
      message: "STRIPE_SECRET_KEY is not configured; billing reconciliation cannot run.",
    } satisfies BillingReconciliationResult;
  }

  return null;
}

function databaseScanConfigError(result: BillingReconciliationResult) {
  if (isDatabaseConfigured()) return null;

  return {
    ...result,
    ok: false,
    message: "DATABASE_URL is not configured; scheduled billing reconciliation cannot scan stored subscriptions.",
  } satisfies BillingReconciliationResult;
}

function userRepairStorageConfigError(result: BillingReconciliationResult) {
  if (isDatabaseConfigured() || isRedisConfigured()) return null;

  return {
    ...result,
    ok: false,
    message: "Neither DATABASE_URL nor Upstash Redis is configured; customer billing repair cannot be saved.",
  } satisfies BillingReconciliationResult;
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

function cleanEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function candidateFromCustomerId(userId: string, customerId?: string | null): SubscriptionCandidate | null {
  const cleanCustomerId = customerId?.trim();
  if (!cleanCustomerId || !cleanCustomerId.startsWith("cus_")) return null;

  return {
    user_id: userId,
    tier: null,
    status: null,
    current_period_end: null,
    stripe_customer_id: cleanCustomerId,
    stripe_subscription_id: null,
    updated_at: null,
  };
}

function checkoutSessionTier(session: Stripe.Checkout.Session) {
  const metadataTier = session.metadata?.plan;
  if (metadataTier === "pro" || metadataTier === "business") return metadataTier;
  return null;
}

function safeCheckoutSessionId(sessionId?: string | null) {
  const value = sessionId?.trim();
  if (!value || !value.startsWith("cs_")) return null;
  return value;
}

function stripeSearchValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function listStripeCustomersByEmail(email: string) {
  const stripe = getStripe();
  const exactList = await stripe.customers.list({ email, limit: 10 });
  if (exactList.data.length > 0) return exactList.data;

  try {
    const searched = await stripe.customers.search({
      query: `email:"${stripeSearchValue(email)}"`,
      limit: 10,
    });
    return searched.data;
  } catch {
    return [];
  }
}

async function listCustomerSubscriptions(customerId: string) {
  const subscriptions = await getStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  return subscriptions.data;
}

async function stripeCustomerCandidateFromRedis(userId: string): Promise<SubscriptionCandidate | null> {
  if (!isRedisConfigured()) return null;

  try {
    const customerId = await getRedis().get<string>(`stripe_customer:${userId}`);
    return candidateFromCustomerId(userId, customerId);
  } catch (error) {
    console.warn("billing_repair_cached_customer_lookup_failed", {
      userId,
      error: errorMessage(error),
    });
    return null;
  }
}

async function stripeCustomerEmail(customerId: string) {
  try {
    const customer = await getStripe().customers.retrieve(customerId);
    if ("deleted" in customer && customer.deleted) return null;
    return cleanEmail(customer.email);
  } catch {
    return null;
  }
}

async function userIdForStoredEmail(email?: string | null) {
  const normalizedEmail = cleanEmail(email);
  if (!normalizedEmail || !isDatabaseConfigured()) return null;

  const rows = await query<{ clerk_user_id: string }>(
    `select clerk_user_id
     from app_users
     where lower(email) = $1
     order by updated_at desc nulls last
     limit 2`,
    [normalizedEmail],
  );

  return rows.length === 1 ? rows[0].clerk_user_id : null;
}

async function ensureSubscriptionMetadata(subscription: Stripe.Subscription, userId: string, tier: QuickFillTier) {
  if (subscription.metadata?.userId === userId && subscription.metadata?.plan === tier) return;

  try {
    await getStripe().subscriptions.update(subscription.id, {
      metadata: {
        ...subscription.metadata,
        userId,
        plan: tier,
      },
    });
  } catch (error) {
    console.warn("stripe_subscription_metadata_repair_failed", {
      subscriptionId: subscription.id,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function checkoutSessionBelongsToUser(session: Stripe.Checkout.Session, userId: string, email?: string | null) {
  const sessionUserId = session.metadata?.userId;
  if (sessionUserId) return sessionUserId === userId;

  const expectedEmail = cleanEmail(email);
  if (!expectedEmail) return false;

  const sessionEmail = cleanEmail(session.customer_details?.email ?? session.customer_email);
  return sessionEmail === expectedEmail;
}

async function stripeCustomerCandidateFromCheckoutHistory(
  userId: string,
  email?: string | null,
): Promise<SubscriptionCandidate | null> {
  const stripe = getStripe();
  const subscriptions = await stripe.subscriptions.list({ status: "all", limit: 100 });
  const liveSubscriptions = subscriptions.data
    .filter((subscription) => LIVE_SUBSCRIPTION_STATUSES.has(subscription.status))
    .sort((a, b) => b.created - a.created);

  for (const subscription of liveSubscriptions) {
    const subscriptionUserId = subscription.metadata?.userId;
    if (subscriptionUserId && subscriptionUserId !== userId) continue;

    const customerId = objectId(subscription.customer);
    if (subscriptionUserId === userId) {
      return {
        user_id: userId,
        tier: subscriptionTier(subscription),
        status: subscription.status,
        current_period_end: null,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        updated_at: null,
      };
    }

    const sessions = await stripe.checkout.sessions.list({ subscription: subscription.id, limit: 10 });
    const matchingSession = sessions.data.find((session) => checkoutSessionBelongsToUser(session, userId, email));
    if (!matchingSession) continue;

    return {
      user_id: userId,
      tier: checkoutSessionTier(matchingSession) ?? subscriptionTier(subscription),
      status: subscription.status,
      current_period_end: null,
      stripe_customer_id: customerId ?? objectId(matchingSession.customer),
      stripe_subscription_id: subscription.id,
      updated_at: null,
    };
  }

  return null;
}

async function stripeCustomerCandidateFromSubscriptionIdentity(
  subscription: Stripe.Subscription,
): Promise<SubscriptionCandidate | null> {
  const metadataUserId = subscription.metadata?.userId;
  const customerId = objectId(subscription.customer);
  const tier = subscriptionTier(subscription);
  if (metadataUserId) {
    return {
      user_id: metadataUserId,
      tier,
      status: subscription.status,
      current_period_end: null,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      updated_at: null,
    };
  }

  const sessions = await getStripe().checkout.sessions.list({ subscription: subscription.id, limit: 10 });
  for (const session of sessions.data) {
    const sessionUserId = session.metadata?.userId;
    if (!sessionUserId) continue;

    return {
      user_id: sessionUserId,
      tier: checkoutSessionTier(session) ?? tier,
      status: subscription.status,
      current_period_end: null,
      stripe_customer_id: customerId ?? objectId(session.customer),
      stripe_subscription_id: subscription.id,
      updated_at: null,
    };
  }

  for (const session of sessions.data) {
    const sessionEmail = cleanEmail(session.customer_details?.email ?? session.customer_email);
    const userId = await userIdForStoredEmail(sessionEmail);
    if (!userId) continue;

    return {
      user_id: userId,
      tier: checkoutSessionTier(session) ?? tier,
      status: subscription.status,
      current_period_end: null,
      stripe_customer_id: customerId ?? objectId(session.customer),
      stripe_subscription_id: subscription.id,
      updated_at: null,
    };
  }

  const customerUserId = await userIdForStoredEmail(customerId ? await stripeCustomerEmail(customerId) : null);
  if (!customerUserId) return null;

  return {
    user_id: customerUserId,
    tier,
    status: subscription.status,
    current_period_end: null,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    updated_at: null,
  };
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

  const customers = await listStripeCustomersByEmail(cleanEmail);
  if (customers.length === 0) return null;

  let fallback: SubscriptionCandidate | null = null;

  for (const customer of customers) {
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
      if (candidate.stripe_customer_id && !candidate.stripe_subscription_id) {
        await saveSubscriptionSnapshot({
          userId: candidate.user_id,
          customerId: candidate.stripe_customer_id,
          subscriptionId: null,
          tier: "free",
          status: "canceled",
          currentPeriodEnd: null,
        });

        result.updated += 1;
        result.downgraded += 1;
        return;
      }

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
    await ensureSubscriptionMetadata(subscription, candidate.user_id, tier);

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

async function reconcileStripeActiveSubscriptionIdentities(
  result: BillingReconciliationResult,
  skipSubscriptionIds: Set<string>,
) {
  const subscriptions = await getStripe().subscriptions.list({ status: "all", limit: STRIPE_ORPHAN_SCAN_LIMIT });
  const liveSubscriptions = subscriptions.data
    .filter((subscription) => LIVE_SUBSCRIPTION_STATUSES.has(subscription.status))
    .filter((subscription) => !skipSubscriptionIds.has(subscription.id))
    .sort((a, b) => b.created - a.created);

  for (const subscription of liveSubscriptions) {
    result.checked += 1;

    try {
      const candidate = await stripeCustomerCandidateFromSubscriptionIdentity(subscription);
      if (!candidate) {
        result.skipped += 1;
        result.errors.push({
          userId: null,
          stripeCustomerId: objectId(subscription.customer),
          stripeSubscriptionId: subscription.id,
          message: "Active Stripe subscription could not be matched to a QuickFill user.",
        });
        continue;
      }

      await reconcileCandidate(candidate, result);
    } catch (error) {
      result.skipped += 1;
      result.errors.push({
        userId: null,
        stripeCustomerId: objectId(subscription.customer),
        stripeSubscriptionId: subscription.id,
        message: errorMessage(error),
      });
    }
  }
}

async function reconcileCachedStripeCustomerMappings(
  result: BillingReconciliationResult,
  skipCustomerIds: Set<string>,
) {
  if (!isRedisConfigured()) return;

  let cursor = "0";
  let scanned = 0;
  const redis = getRedis() as unknown as {
    scan?: (cursor: string | number, options?: { match?: string; count?: number }) => Promise<[string | number, string[]]>;
    get: <T>(key: string) => Promise<T | null>;
  };

  if (typeof redis.scan !== "function") return;

  do {
    const [nextCursor, keys] = await redis.scan(cursor, {
      match: "stripe_customer:*",
      count: REDIS_CUSTOMER_SCAN_LIMIT,
    });
    cursor = String(nextCursor);

    for (const key of keys) {
      if (scanned >= REDIS_CUSTOMER_SCAN_LIMIT) return;
      if (!key.startsWith("stripe_customer:") || key.startsWith("stripe_customer_user:")) continue;

      const userId = key.slice("stripe_customer:".length);
      if (!userId) continue;

      const customerId = await redis.get<string>(key);
      const candidate = candidateFromCustomerId(userId, customerId);
      if (!candidate?.stripe_customer_id || skipCustomerIds.has(candidate.stripe_customer_id)) continue;

      skipCustomerIds.add(candidate.stripe_customer_id);
      scanned += 1;
      result.checked += 1;
      await reconcileCandidate(candidate, result);
    }
  } while (cursor !== "0");
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
  const configError = stripeConfigError(result) ?? databaseScanConfigError(result);
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

  await reconcileCachedStripeCustomerMappings(
    result,
    new Set(candidates.map((candidate) => candidate.stripe_customer_id).filter((id): id is string => Boolean(id))),
  );

  await reconcileStripeActiveSubscriptionIdentities(
    result,
    new Set(candidates.map((candidate) => candidate.stripe_subscription_id).filter((id): id is string => Boolean(id))),
  );

  return finalizeResult(result);
}

export async function reconcileStripeBillingForUser(
  userId: string,
  options: BillingReconciliationForUserOptions = {},
): Promise<BillingReconciliationResult> {
  const result = createResult("Customer billing record synced from Stripe.");
  const configError = stripeConfigError(result) ?? userRepairStorageConfigError(result);
  if (configError) return configError;
  const lookupErrors: ReconciliationError[] = [];

  let sessionCandidate: SubscriptionCandidate | null = null;
  try {
    sessionCandidate = await stripeCustomerCandidateFromCheckoutSession(userId, options.sessionId);
  } catch (error) {
    lookupErrors.push({
      userId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      message: errorMessage(error),
    });
  }

  let candidates: SubscriptionCandidate[] = [];
  if (!sessionCandidate && isDatabaseConfigured()) {
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
      lookupErrors.push({
        userId,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        message: errorMessage(error),
      });
    }
  }

  const emailCandidate = sessionCandidate || candidates[0] ? null : await stripeCustomerCandidateFromEmail(userId, options.email);
  const redisCandidate =
    sessionCandidate || candidates[0] || emailCandidate ? null : await stripeCustomerCandidateFromRedis(userId);
  const checkoutHistoryCandidate =
    sessionCandidate || candidates[0] || emailCandidate || redisCandidate
      ? null
      : await stripeCustomerCandidateFromCheckoutHistory(userId, options.email);
  const candidate = sessionCandidate ?? candidates[0] ?? emailCandidate ?? redisCandidate ?? checkoutHistoryCandidate;
  if (!candidate) {
    result.errors.push(...lookupErrors);
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
  if (result.updated === 0) result.errors.push(...lookupErrors);
  return finalizeResult(result);
}
