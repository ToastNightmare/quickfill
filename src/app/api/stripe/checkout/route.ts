import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { APP_CONFIG } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackServerEvent } from "@/lib/server-analytics";
import { alertAdmins } from "@/lib/admin-alerts";
import { getStoredSubscriptionSnapshot, type StoredSubscriptionSnapshot } from "@/lib/billing-store";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BILLING_REPAIR_STATUSES = new Set(["past_due", "unpaid", "incomplete", "paused"]);
const BILLING_PORTAL_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", ...BILLING_REPAIR_STATUSES]);

function appOrigin(req: NextRequest) {
  const configured = APP_CONFIG.url;
  if (configured && !configured.includes("localhost")) return configured;
  return req.headers.get("origin") ?? configured ?? "http://localhost:3000";
}

function requesterId(req: NextRequest, userId: string) {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  return userId || forwarded?.split(",")[0] || realIp || "anonymous";
}

function priceForPlan(plan: "pro" | "business", annual: boolean) {
  if (plan === "business") {
    return annual ? process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID : process.env.STRIPE_BUSINESS_PRICE_ID;
  }

  return annual ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID : process.env.STRIPE_PRO_PRICE_ID;
}

function shouldUseBillingPortal(snapshot: StoredSubscriptionSnapshot | null) {
  if (!snapshot?.stripeCustomerId) return false;
  if (snapshot.entitled) return true;
  if (!snapshot.stripeSubscriptionId) return false;
  return BILLING_REPAIR_STATUSES.has(snapshot.status);
}

function shouldUseBillingPortalForStripeSubscription(subscription: Stripe.Subscription) {
  return BILLING_PORTAL_SUBSCRIPTION_STATUSES.has(subscription.status);
}

function stripeSearchValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function safeAlertAdmins(input: Parameters<typeof alertAdmins>[0]) {
  try {
    await alertAdmins(input);
  } catch (error) {
    log.error("admin_alert_failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

function checkoutErrorResponse(error: string, status: number, code: string, fields: Record<string, unknown> = {}) {
  return NextResponse.json({ error, code, ...fields }, { status });
}

async function checkoutUserProfile(userId: string) {
  try {
    const user = await currentUser();
    return {
      email: user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null,
      firstName: user?.firstName ?? "",
    };
  } catch (error) {
    log.error("stripe_checkout_clerk_user_lookup_failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { email: null, firstName: "" };
  }
}

async function checkoutBillingContext(userId: string) {
  const [snapshotResult, cachedCustomerResult] = await Promise.allSettled([
    getStoredSubscriptionSnapshot(userId),
    isRedisConfigured() ? getRedis().get<string>(`stripe_customer:${userId}`) : Promise.resolve(null),
  ]);

  if (snapshotResult.status === "rejected") {
    log.error("stripe_checkout_subscription_snapshot_failed", {
      userId,
      error: snapshotResult.reason instanceof Error ? snapshotResult.reason.message : String(snapshotResult.reason),
    });
  }

  if (cachedCustomerResult.status === "rejected") {
    log.error("stripe_checkout_customer_cache_read_failed", {
      userId,
      error: cachedCustomerResult.reason instanceof Error ? cachedCustomerResult.reason.message : String(cachedCustomerResult.reason),
    });
  }

  return {
    snapshot: snapshotResult.status === "fulfilled" ? snapshotResult.value : null,
    cachedCustomerId: cachedCustomerResult.status === "fulfilled" ? cachedCustomerResult.value : null,
  };
}

async function findStripeCustomerIdByEmail(email?: string | null) {
  if (!email) return null;

  try {
    const customers = await getStripe().customers.list({ email, limit: 1 });
    if (customers.data[0]?.id) return customers.data[0].id;
  } catch (error) {
    log.error("stripe_checkout_customer_list_failed", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const customers = await getStripe().customers.search({ query: `email:\"${stripeSearchValue(email)}\"`, limit: 1 });
    return customers.data[0]?.id ?? null;
  } catch (error) {
    log.error("stripe_checkout_customer_search_failed", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function cacheStripeCustomerForUser(userId: string, customerId: string) {
  if (!isRedisConfigured()) return;

  try {
    const redis = getRedis();
    await Promise.all([
      redis.set(`stripe_customer:${userId}`, customerId),
      redis.set(`stripe_customer_user:${customerId}`, userId),
    ]);
  } catch (error) {
    log.error("stripe_checkout_customer_cache_write_failed", {
      userId,
      customerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function findPortalEligibleStripeSubscription(customerId: string) {
  const subscriptions = await getStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  return subscriptions.data.find(shouldUseBillingPortalForStripeSubscription) ?? null;
}

function portalResponse(subscription: StoredSubscriptionSnapshot | Stripe.Subscription) {
  const status = subscription.status;
  const alreadySubscribed = status === "active" || status === "trialing";
  return {
    alreadySubscribed,
    needsBillingRepair: !alreadySubscribed,
  };
}

function checkoutSuccessUrl(origin: string, params: Record<string, string> = {}) {
  const url = new URL("/checkout/success", origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function openInvoicePaymentUrl(customerId: string) {
  const invoices = await getStripe().invoices.list({
    customer: customerId,
    status: "open",
    limit: 10,
  });

  return invoices.data.find((invoice) => invoice.hosted_invoice_url)?.hosted_invoice_url ?? null;
}

async function billingPortalOrRepairResponse(
  customerId: string,
  origin: string,
  subscription: StoredSubscriptionSnapshot | Stripe.Subscription,
) {
  const response = portalResponse(subscription);
  const successUrl = checkoutSuccessUrl(origin, response.alreadySubscribed ? { alreadyPro: "true" } : { repair: "true" });

  if (response.alreadySubscribed) {
    return NextResponse.json({
      url: successUrl,
      alreadySubscribed: true,
      needsBillingRepair: false,
    });
  }

  try {
    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: successUrl,
    });

    return NextResponse.json({
      url: portalSession.url,
      paymentRepair: true,
      ...response,
    });
  } catch (error) {
    log.error("stripe_checkout_portal_repair_link_failed", {
      customerId,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      const invoiceUrl = await openInvoicePaymentUrl(customerId);
      if (invoiceUrl) {
        return NextResponse.json({
          url: invoiceUrl,
          paymentRepair: true,
          ...response,
        });
      }
    } catch (invoiceError) {
      log.error("stripe_checkout_invoice_lookup_failed", {
        customerId,
        error: invoiceError instanceof Error ? invoiceError.message : String(invoiceError),
      });
    }

    log.error("stripe_checkout_repair_link_failed", {
      customerId,
      error: error instanceof Error ? error.message : String(error),
    });
    return checkoutErrorResponse(
      "Your previous Pro payment needs updating before a new Pro checkout can start. Please contact support and we will fix it for you.",
      409,
      "billing_repair_required",
      { needsBillingRepair: true },
    );
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return checkoutErrorResponse("Please sign in before starting checkout.", 401, "auth_required");
  }

  const limited = await checkRateLimit(requesterId(req, userId), "checkout");
  if (!limited.success) {
    return checkoutErrorResponse("Too many checkout attempts, try again in a minute.", 429, "checkout_rate_limited");
  }

  const { email, firstName } = await checkoutUserProfile(userId);
  const origin = appOrigin(req);

  let plan: "pro" | "business" = "pro";
  let annual = false;
  const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
  const utmMetadata: Record<string, string> = {};
  let bodyJson: Record<string, unknown> = {};
  try {
    bodyJson = await req.json();
    if (bodyJson.plan === "business") plan = "business";
    if (bodyJson.annual === true) annual = true;
    for (const key of utmKeys) {
      if (typeof bodyJson[key] === "string" && bodyJson[key].length > 0) {
        utmMetadata[key] = String(bodyJson[key]).slice(0, 100);
      }
    }
  } catch {
    // Default to Pro monthly when no JSON body is supplied.
  }

  const billing = annual ? "annual" : "monthly";

  try {
    const metadata = { userId, plan, billing, firstName, ...utmMetadata };
    const { snapshot, cachedCustomerId } = await checkoutBillingContext(userId);
    let existingCustomerId = snapshot?.stripeCustomerId ?? cachedCustomerId;

    if (shouldUseBillingPortal(snapshot) && snapshot?.stripeCustomerId) {
      return billingPortalOrRepairResponse(snapshot.stripeCustomerId, origin, snapshot);
    }

    if (!existingCustomerId) {
      existingCustomerId = await findStripeCustomerIdByEmail(email);
      if (existingCustomerId) {
        await cacheStripeCustomerForUser(userId, existingCustomerId);
        log.info("stripe_checkout_customer_matched_by_email", { userId, customerId: existingCustomerId, email });
      }
    }

    if (existingCustomerId) {
      const existingSubscription = await findPortalEligibleStripeSubscription(existingCustomerId);
      if (existingSubscription) {
        log.info("stripe_checkout_existing_subscription_found", {
          userId,
          customerId: existingCustomerId,
          subscriptionId: existingSubscription.id,
          status: existingSubscription.status,
        });
        return billingPortalOrRepairResponse(existingCustomerId, origin, existingSubscription);
      }
    }

    const priceId = priceForPlan(plan, annual);
    if (!priceId) {
      log.error("stripe_checkout_missing_price", { plan, billing });
      await safeAlertAdmins({
        subject: "Checkout price is missing",
        title: "Stripe checkout price is not configured",
        message: "A user tried to start checkout, but the required Stripe price ID is missing from production environment variables.",
        fields: { plan, billing, userId, email: email ?? "unknown" },
      });
      return checkoutErrorResponse(`${plan} ${billing} billing is not configured yet.`, 500, "checkout_price_missing");
    }

    const cancelParams = new URLSearchParams({ checkout: "cancelled", plan, billing });

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      ...(existingCustomerId ? { customer: existingCustomerId } : email ? { customer_email: email } : {}),
      success_url: checkoutSuccessUrl(origin, {
        session_id: "{CHECKOUT_SESSION_ID}",
        plan,
        billing,
      }),
      cancel_url: `${origin}/pricing?${cancelParams.toString()}`,
      allow_promotion_codes: true,
      metadata,
      subscription_data: { metadata },
    });

    await trackServerEvent("checkout_start", { source: "server", plan, billing });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("stripe_checkout_session_failed", { plan, billing, userId, email, error: message });
    await safeAlertAdmins({
      subject: "Checkout session failed",
      title: "Stripe checkout could not be started",
      message: "A signed-in user could not be sent to Stripe Checkout.",
      fields: { plan, billing, userId, email: email ?? "unknown", error: message },
    });
    return checkoutErrorResponse(
      "Checkout could not be started. Please contact support if this keeps happening.",
      500,
      "checkout_unexpected_failure",
    );
  }
}
