import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(text, search, replacement) {
  if (!text.includes(search)) {
    throw new Error(`Expected billing adapter anchor not found: ${search.slice(0, 80)}`);
  }
  return text.replace(search, replacement);
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

function wireStripeWebhook() {
  const file = "src/app/api/stripe/webhook/route.ts";
  let text = readFileSync(file, "utf8");

  if (text.includes("getUserIdFromCheckoutSession")) return;

  text = replaceOnce(
    text,
    `async function getUserIdForSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const metaUserId = subscription.metadata?.userId;
  if (metaUserId) return metaUserId;
  if (!subscription.customer) return null;
  return getUserIdForCustomer(subscription.customer as string);
}`,
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
  );

  writeFileSync(file, text);
}

wireBillingReconciliation();
wireStripeWebhook();
