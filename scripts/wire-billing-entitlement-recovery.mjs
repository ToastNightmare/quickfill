import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(text, search, replacement) {
  if (text.includes(search)) {
    return text.replace(search, replacement);
  }

  const crlfSearch = search.replace(/\n/g, "\r\n");
  if (crlfSearch !== search && text.includes(crlfSearch)) {
    return text.replace(crlfSearch, replacement.replace(/\n/g, "\r\n"));
  }

  throw new Error(`Expected billing adapter anchor not found: ${search.slice(0, 80)}`);
}

function replaceOncePattern(text, pattern, replacement, label) {
  const next = text.replace(pattern, replacement);
  if (next === text) {
    throw new Error(`Expected billing adapter anchor not found: ${label}`);
  }
  return next;
}

function wireBillingReconciliation() {
  const file = "src/lib/billing-reconciliation.ts";
  let text = readFileSync(file, "utf8");

  if (text.includes("stripeCustomerCandidateFromCheckoutHistory")) return;

  text = replaceOnce(
    text,
    `function objectId(value: string | { id?: string } | null | undefined) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.id === "string") return value.id;
  return null;
}

function safeCheckoutSessionId`,
    `function objectId(value: string | { id?: string } | null | undefined) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.id === "string") return value.id;
  return null;
}

function cleanEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function checkoutSessionTier(session: Stripe.Checkout.Session) {
  const metadataTier = session.metadata?.plan;
  if (metadataTier === "pro" || metadataTier === "business") return metadataTier;
  return null;
}

function safeCheckoutSessionId`,
  );

  text = replaceOnce(
    text,
    `async function fetchCurrentSubscription(candidate: SubscriptionCandidate) {`,
    `function checkoutSessionBelongsToUser(session: Stripe.Checkout.Session, userId: string, email?: string | null) {
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

async function fetchCurrentSubscription(candidate: SubscriptionCandidate) {`,
  );

  text = replaceOnce(
    text,
    `  const emailCandidate = sessionCandidate || candidates[0] ? null : await stripeCustomerCandidateFromEmail(userId, options.email);
  const candidate = sessionCandidate ?? candidates[0] ?? emailCandidate;`,
    `  const emailCandidate = sessionCandidate || candidates[0] ? null : await stripeCustomerCandidateFromEmail(userId, options.email);
  const checkoutHistoryCandidate =
    sessionCandidate || candidates[0] || emailCandidate
      ? null
      : await stripeCustomerCandidateFromCheckoutHistory(userId, options.email);
  const candidate = sessionCandidate ?? candidates[0] ?? emailCandidate ?? checkoutHistoryCandidate;`,
  );

  writeFileSync(file, text);
}

function wireBillingReconciliationHardening() {
  const file = "src/lib/billing-reconciliation.ts";
  let text = readFileSync(file, "utf8");

  if (text.includes("STRIPE_ORPHAN_SCAN_LIMIT")) return;

  text = replaceOnce(
    text,
    `const LIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing"]);\n`,
    `const LIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing"]);\nconst STRIPE_ORPHAN_SCAN_LIMIT = 100;\n`,
  );

  text = replaceOnce(
    text,
    `async function listCustomerSubscriptions(customerId: string) {
  const subscriptions = await getStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  return subscriptions.data;
}

function checkoutSessionBelongsToUser`,
    `async function listCustomerSubscriptions(customerId: string) {
  const subscriptions = await getStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  return subscriptions.data;
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
    \`select clerk_user_id
     from app_users
     where lower(email) = $1
     order by updated_at desc nulls last
     limit 2\`,
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

function checkoutSessionBelongsToUser`,
  );

  text = replaceOnce(
    text,
    `async function fetchCurrentSubscription(candidate: SubscriptionCandidate) {`,
    `async function stripeCustomerCandidateFromSubscriptionIdentity(
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

async function fetchCurrentSubscription(candidate: SubscriptionCandidate) {`,
  );

  text = replaceOnce(
    text,
    `    await saveSubscriptionSnapshot({
      userId: candidate.user_id,
      customerId,
      subscriptionId: subscription.id,
      tier,
      status: subscription.status,
      currentPeriodEnd: periodEnd,
    });

    result.updated += 1;`,
    `    await saveSubscriptionSnapshot({
      userId: candidate.user_id,
      customerId,
      subscriptionId: subscription.id,
      tier,
      status: subscription.status,
      currentPeriodEnd: periodEnd,
    });
    await ensureSubscriptionMetadata(subscription, candidate.user_id, tier);

    result.updated += 1;`,
  );

  text = replaceOnce(
    text,
    `function finalizeResult(result: BillingReconciliationResult) {`,
    `async function reconcileStripeActiveSubscriptionIdentities(
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

function finalizeResult(result: BillingReconciliationResult) {`,
  );

  text = replaceOnce(
    text,
    `  for (const candidate of candidates) {
    await reconcileCandidate(candidate, result);
  }

  return finalizeResult(result);`,
    `  for (const candidate of candidates) {
    await reconcileCandidate(candidate, result);
  }

  await reconcileStripeActiveSubscriptionIdentities(
    result,
    new Set(candidates.map((candidate) => candidate.stripe_subscription_id).filter((id): id is string => Boolean(id))),
  );

  return finalizeResult(result);`,
  );

  writeFileSync(file, text);
}

function wireUsageEntitlementRepair() {
  const file = "src/app/api/usage/route.ts";
  let text = readFileSync(file, "utf8");

  if (text.includes("BILLING_REPAIR_COOLDOWN_SECONDS")) return;

  text = replaceOnce(
    text,
    `import { NextRequest, NextResponse } from "next/server";`,
    `import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";`,
  );
  text = replaceOnce(
    text,
    `import { getStoredSubscriptionSnapshot, recordUsageEvent } from "@/lib/billing-store";`,
    `import { getStoredSubscriptionSnapshot, recordUsageEvent } from "@/lib/billing-store";
import { reconcileStripeBillingForUser } from "@/lib/billing-reconciliation";`,
  );
  text = replaceOnce(
    text,
    `const GUEST_TTL_SECONDS = 30 * 24 * 60 * 60;\n`,
    `const GUEST_TTL_SECONDS = 30 * 24 * 60 * 60;
const BILLING_REPAIR_COOLDOWN_SECONDS = 10 * 60;\n`,
  );
  text = replaceOnce(
    text,
    `type Entitlement = Awaited<ReturnType<typeof getRequestEntitlement>>;\n`,
    `type Entitlement = Awaited<ReturnType<typeof getRequestEntitlement>>;
type SubscriptionSnapshot = Awaited<ReturnType<typeof getStoredSubscriptionSnapshot>>;\n`,
  );
  text = replaceOnce(
    text,
    `function limitForTier(tier: Entitlement["tier"], fallback: number) {
  return TIER_LIMITS[tier] ?? fallback;
}

export async function GET(request: NextRequest) {`,
    `function limitForTier(tier: Entitlement["tier"], fallback: number) {
  return TIER_LIMITS[tier] ?? fallback;
}

async function shouldTryBillingRepair(userId: string) {
  if (!isRedisConfigured()) return true;

  try {
    const redis = getRedis();
    const key = \`billing_repair_checked:\${userId}\`;
    const previous = await redis.get<string>(key);
    if (previous) return false;

    await redis.set(key, "1", { ex: BILLING_REPAIR_COOLDOWN_SECONDS });
    return true;
  } catch (error) {
    logUsageReadError("billing_repair_cooldown", error);
    return true;
  }
}

async function refreshEntitlementFromStripeIfNeeded(request: NextRequest, entitlement: Entitlement) {
  if (!entitlement.userId || entitlement.isPaid || entitlement.qa) {
    return {
      entitlement,
      subscription: entitlement.userId ? await getStoredSubscriptionSnapshot(entitlement.userId) : null,
    };
  }

  let subscription = await getStoredSubscriptionSnapshot(entitlement.userId);
  if (subscription?.entitled) return { entitlement, subscription };
  if (!(await shouldTryBillingRepair(entitlement.userId))) return { entitlement, subscription };

  try {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
    const result = await reconcileStripeBillingForUser(entitlement.userId, { email });
    if (result.updated <= 0) return { entitlement, subscription };

    const refreshedEntitlement = await getRequestEntitlement(request);
    subscription = refreshedEntitlement.userId ? await getStoredSubscriptionSnapshot(refreshedEntitlement.userId) : null;
    return { entitlement: refreshedEntitlement, subscription };
  } catch (error) {
    logUsageReadError("billing_repair", error);
    return { entitlement, subscription };
  }
}

export async function GET(request: NextRequest) {`,
  );
  text = replaceOnce(
    text,
    `    const entitlement = await getRequestEntitlement(request);
    const key = usageKey(entitlement);`,
    `    let entitlement = await getRequestEntitlement(request);
    let subscription: SubscriptionSnapshot = null;
    ({ entitlement, subscription } = await refreshEntitlementFromStripeIfNeeded(request, entitlement));
    const key = usageKey(entitlement);`,
  );
  text = replaceOnce(
    text,
    `      entitlement.userId ? getStoredSubscriptionSnapshot(entitlement.userId) : Promise.resolve(null),`,
    `      Promise.resolve(subscription),`,
  );
  text = replaceOnce(
    text,
    `    const subscription = subscriptionResult.status === "fulfilled" ? subscriptionResult.value : null;
    const subscriptionEntitled = Boolean(subscription?.entitled);
    const tier = subscriptionEntitled ? subscription!.tier : entitlement.tier;`,
    `    const currentSubscription = subscriptionResult.status === "fulfilled" ? subscriptionResult.value : null;
    const subscriptionEntitled = Boolean(currentSubscription?.entitled);
    const tier = subscriptionEntitled ? currentSubscription!.tier : entitlement.tier;`,
  );
  text = replaceOnce(
    text,
    `      billing: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            updatedAt: subscription.updatedAt,
            entitled: subscription.entitled,
            needsReview: subscription.needsReview,
            reviewReason: subscription.reviewReason,
            hasStripeCustomer: Boolean(subscription.stripeCustomerId),
            delinquent: isDelinquentBillingStatus(subscription.status),
          }`,
    `      billing: currentSubscription
        ? {
            status: currentSubscription.status,
            currentPeriodEnd: currentSubscription.currentPeriodEnd,
            updatedAt: currentSubscription.updatedAt,
            entitled: currentSubscription.entitled,
            needsReview: currentSubscription.needsReview,
            reviewReason: currentSubscription.reviewReason,
            hasStripeCustomer: Boolean(currentSubscription.stripeCustomerId),
            delinquent: isDelinquentBillingStatus(currentSubscription.status),
          }`,
  );

  writeFileSync(file, text);
}

function wireClerkAppUsers() {
  const file = "src/app/api/webhooks/clerk/route.ts";
  let text = readFileSync(file, "utf8");

  if (text.includes("syncAppUser")) return;

  text = replaceOnce(
    text,
    `import { Resend } from "resend";`,
    `import { Resend } from "resend";
import { isDatabaseConfigured, query } from "@/lib/db";

type ClerkWebhookEvent = {
  type: string;
  data: {
    id?: string;
    email_addresses?: { id?: string; email_address: string }[];
    primary_email_address_id?: string | null;
    first_name?: string;
  };
};`,
  );
  text = replaceOnce(
    text,
    `function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest) {`,
    `function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function primaryEmail(data: ClerkWebhookEvent["data"]) {
  const primary = data.email_addresses?.find((item) => item.id && item.id === data.primary_email_address_id);
  return primary?.email_address ?? data.email_addresses?.[0]?.email_address ?? null;
}

async function upsertAppUser(data: ClerkWebhookEvent["data"]) {
  if (!data.id || !isDatabaseConfigured()) return;

  await query(
    \`insert into app_users (clerk_user_id, email, updated_at)
     values ($1, $2, now())
     on conflict (clerk_user_id) do update set
       email = excluded.email,
       updated_at = now()\`,
    [data.id, primaryEmail(data)],
  );
}

async function deleteAppUser(data: ClerkWebhookEvent["data"]) {
  if (!data.id || !isDatabaseConfigured()) return;
  await query("delete from app_users where clerk_user_id = $1", [data.id]);
}

async function syncAppUser(evt: ClerkWebhookEvent) {
  try {
    if (evt.type === "user.created" || evt.type === "user.updated") {
      await upsertAppUser(evt.data);
    } else if (evt.type === "user.deleted") {
      await deleteAppUser(evt.data);
    }
  } catch (error) {
    console.error("clerk_app_user_sync_failed", {
      userId: evt.data.id,
      eventType: evt.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function POST(req: NextRequest) {`,
  );
  text = replaceOnce(
    text,
    `  let evt: {
    type: string;
    data: {
      email_addresses?: { email_address: string }[];
      first_name?: string;
    };
  };`,
    `  let evt: ClerkWebhookEvent;`,
  );
  text = replaceOnce(
    text,
    `  if (evt.type === "user.created") {
    const email = evt.data.email_addresses?.[0]?.email_address;`,
    `  await syncAppUser(evt);

  if (evt.type === "user.created") {
    const email = primaryEmail(evt.data);`,
  );

  writeFileSync(file, text);
}

function wireStripeWebhook() {
  const file = "src/app/api/stripe/webhook/route.ts";
  let text = readFileSync(file, "utf8");

  if (text.includes("getUserIdFromCheckoutSession")) return;

  text = replaceOncePattern(
    text,
    /async function getUserIdForSubscription\(subscription: Stripe\.Subscription\): Promise<string \| null> \{\r?\n  const metaUserId = subscription\.metadata\?\.userId;\r?\n  if \(metaUserId\) return metaUserId;\r?\n  if \(!subscription\.customer\) return null;\r?\n  return getUserIdForCustomer\(subscription\.customer as string\);\r?\n\}/,
    `async function getUserIdFromCheckoutSession(subscriptionId: string): Promise<string | null> {
  try {
    const sessions = await getStripe().checkout.sessions.list({ subscription: subscriptionId, limit: 10 });
    for (const session of sessions.data) {
      const userId = session.metadata?.userId;
      if (userId) return userId;
    }
  } catch (error) {
    log.warn("stripe_checkout_session_user_lookup_failed", {
      subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return null;
}

async function getUserIdForSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const metaUserId = subscription.metadata?.userId;
  if (metaUserId) return metaUserId;

  if (subscription.customer) {
    const customerUserId = await getUserIdForCustomer(subscription.customer as string);
    if (customerUserId) return customerUserId;
  }

  return getUserIdFromCheckoutSession(subscription.id);
}`,
    "getUserIdForSubscription",
  );

  writeFileSync(file, text);
}

wireBillingReconciliation();
wireBillingReconciliationHardening();
wireStripeWebhook();
wireUsageEntitlementRepair();
wireClerkAppUsers();
