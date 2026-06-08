/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

import { POST } from "../webhook/route";
import { alertAdmins } from "@/lib/admin-alerts";
import {
  saveSubscriptionSnapshot,
  hasProcessedStripeEvent,
  markStripeEventProcessed,
  stripeSubscriptionPeriodEnd,
  tierFromPriceId,
} from "@/lib/billing-store";
import { isDatabaseConfigured, query } from "@/lib/db";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { trackServerEvent } from "@/lib/server-analytics";
import { getStripe } from "@/lib/stripe";

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn() },
  })),
}));

jest.mock("@/lib/admin-alerts", () => ({
  alertAdmins: jest.fn(),
}));

jest.mock("@/lib/billing-store", () => ({
  hasProcessedStripeEvent: jest.fn(),
  markStripeEventProcessed: jest.fn(),
  saveSubscriptionSnapshot: jest.fn(),
  stripeSubscriptionPeriodEnd: jest.fn(),
  tierFromPriceId: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  isDatabaseConfigured: jest.fn(),
  query: jest.fn(),
}));

jest.mock("@/lib/log", () => ({
  log: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("@/lib/redis", () => ({
  getRedis: jest.fn(),
  isRedisConfigured: jest.fn(),
}));

jest.mock("@/lib/server-analytics", () => ({
  trackServerEvent: jest.fn(),
}));

jest.mock("@/lib/stripe", () => ({
  getStripe: jest.fn(),
}));

const mockGetStripe = jest.mocked(getStripe);
const mockAlertAdmins = jest.mocked(alertAdmins);
const mockHasProcessedStripeEvent = jest.mocked(hasProcessedStripeEvent);
const mockMarkStripeEventProcessed = jest.mocked(markStripeEventProcessed);
const mockSaveSubscriptionSnapshot = jest.mocked(saveSubscriptionSnapshot);
const mockStripeSubscriptionPeriodEnd = jest.mocked(stripeSubscriptionPeriodEnd);
const mockTierFromPriceId = jest.mocked(tierFromPriceId);
const mockIsDatabaseConfigured = jest.mocked(isDatabaseConfigured);
const mockQuery = jest.mocked(query);
const mockGetRedis = jest.mocked(getRedis);
const mockIsRedisConfigured = jest.mocked(isRedisConfigured);
const mockTrackServerEvent = jest.mocked(trackServerEvent);

type StripeMock = {
  customers: { retrieve: jest.Mock };
  subscriptions: { retrieve: jest.Mock; update: jest.Mock };
  webhooks: { constructEvent: jest.Mock };
};

function makeRequest() {
  return new NextRequest("https://getquickfill.com/api/stripe/webhook", {
    method: "POST",
    body: "{}",
    headers: {
      "stripe-signature": "sig_test",
    },
  });
}

function makeEvent(type: string, object: Record<string, unknown>, id = "evt_test") {
  return {
    id,
    type,
    data: { object },
  };
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_test",
    customer: "cus_test",
    subscription: "sub_test",
    lines: { data: [] },
    ...overrides,
  };
}

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_test",
    customer: "cus_test",
    status: "active",
    metadata: { userId: "user_test", plan: "pro" },
    items: { data: [{ price: { id: "price_pro" } }] },
    ...overrides,
  };
}

describe("Stripe webhook payment truth", () => {
  let stripe: StripeMock;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    delete process.env.RESEND_API_KEY;

    stripe = {
      customers: { retrieve: jest.fn().mockResolvedValue({ email: "user@example.com" }) },
      subscriptions: {
        retrieve: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      webhooks: { constructEvent: jest.fn() },
    };

    mockGetStripe.mockReturnValue(stripe as never);
    mockHasProcessedStripeEvent.mockResolvedValue(false);
    mockMarkStripeEventProcessed.mockResolvedValue(undefined);
    mockSaveSubscriptionSnapshot.mockResolvedValue(undefined);
    mockStripeSubscriptionPeriodEnd.mockReturnValue(1770768000);
    mockTierFromPriceId.mockReturnValue("pro");
    mockIsRedisConfigured.mockReturnValue(true);
    mockGetRedis.mockReturnValue({ get: jest.fn().mockResolvedValue("user_test") } as never);
    mockIsDatabaseConfigured.mockReturnValue(false);
    mockQuery.mockResolvedValue([] as never);
    mockTrackServerEvent.mockResolvedValue(undefined);
    mockAlertAdmins.mockResolvedValue(undefined);
  });

  it("refreshes subscription truth when an invoice payment fails", async () => {
    stripe.webhooks.constructEvent.mockReturnValue(makeEvent("invoice.payment_failed", makeInvoice()));
    stripe.subscriptions.retrieve.mockResolvedValue(makeSubscription({ status: "past_due" }));

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_test");
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "past_due",
        customerId: "cus_test",
        subscriptionId: "sub_test",
        tier: "pro",
        userId: "user_test",
      }),
    );
    expect(mockMarkStripeEventProcessed).toHaveBeenCalledWith("evt_test", "invoice.payment_failed");
  });

  it("restores active subscription truth when an invoice payment succeeds", async () => {
    stripe.webhooks.constructEvent.mockReturnValue(makeEvent("invoice.payment_succeeded", makeInvoice()));
    stripe.subscriptions.retrieve.mockResolvedValue(makeSubscription({ status: "active" }));

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        tier: "pro",
        userId: "user_test",
      }),
    );
    expect(mockMarkStripeEventProcessed).toHaveBeenCalledWith("evt_test", "invoice.payment_succeeded");
  });

  it("uses invoice line subscription details when Stripe does not expose invoice.subscription", async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      makeEvent(
        "invoice.payment_succeeded",
        makeInvoice({
          subscription: null,
          lines: {
            data: [
              {
                parent: {
                  subscription_item_details: { subscription: "sub_from_line" },
                },
              },
            ],
          },
        }),
      ),
    );
    stripe.subscriptions.retrieve.mockResolvedValue(makeSubscription({ id: "sub_from_line" }));

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_from_line");
    expect(mockMarkStripeEventProcessed).toHaveBeenCalledWith("evt_test", "invoice.payment_succeeded");
  });

  it("keeps unpaid subscription updates from being treated as healthy Pro", async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      makeEvent("customer.subscription.updated", makeSubscription({ status: "unpaid" })),
    );

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "unpaid",
        tier: "pro",
        userId: "user_test",
      }),
    );
    expect(mockMarkStripeEventProcessed).toHaveBeenCalledWith("evt_test", "customer.subscription.updated");
  });

  it("reverts cancelled subscriptions to free", async () => {
    stripe.webhooks.constructEvent.mockReturnValue(
      makeEvent("customer.subscription.deleted", makeSubscription({ status: "canceled" })),
    );

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "canceled",
        customerId: "cus_test",
        subscriptionId: "sub_test",
        tier: "free",
        userId: "user_test",
      }),
    );
    expect(mockTrackServerEvent).toHaveBeenCalledWith("subscription_cancelled", { source: "stripe_subscription" });
    expect(mockMarkStripeEventProcessed).toHaveBeenCalledWith("evt_test", "customer.subscription.deleted");
  });

  it("skips duplicate webhook events before touching Stripe again", async () => {
    stripe.webhooks.constructEvent.mockReturnValue(makeEvent("invoice.payment_failed", makeInvoice()));
    mockHasProcessedStripeEvent.mockResolvedValue(true);

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, duplicate: true });
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(mockSaveSubscriptionSnapshot).not.toHaveBeenCalled();
    expect(mockMarkStripeEventProcessed).not.toHaveBeenCalled();
  });

  it("does not mark failed webhook work as processed so Stripe can retry", async () => {
    stripe.webhooks.constructEvent.mockReturnValue(makeEvent("invoice.payment_failed", makeInvoice(), "evt_retry"));
    stripe.subscriptions.retrieve.mockRejectedValue(new Error("Stripe timeout"));

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Webhook processing failed" });
    expect(mockMarkStripeEventProcessed).not.toHaveBeenCalled();
    expect(mockAlertAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Stripe webhook processing failed",
      }),
    );
  });

  it("handleCheckoutCompleted with UTM in session.metadata passes utm_source, utm_medium, utm_campaign to trackServerEvent", async () => {
    const sessionWithUtm = {
      id: "cs_test",
      customer: "cus_test",
      customer_email: "user@example.com",
      metadata: { userId: "user_test", plan: "pro", billing: "annual", utm_source: "google", utm_medium: "cpc", utm_campaign: "summer_sale" },
      subscription: "sub_test",
    };

    stripe.webhooks.constructEvent.mockReturnValue(makeEvent("checkout.session.completed", sessionWithUtm, "evt_utm_test"));
    stripe.subscriptions.retrieve.mockResolvedValue(makeSubscription({ id: "sub_test" }));

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(mockTrackServerEvent).toHaveBeenCalledWith("subscription_started", {
      source: "stripe_checkout",
      tier: "pro",
      billing: "annual",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "summer_sale",
    });
  });

  it("handleCheckoutCompleted with NO UTM in session.metadata calls trackServerEvent without UTM keys", async () => {
    const sessionWithoutUtm = {
      id: "cs_test",
      customer: "cus_test",
      customer_email: "user@example.com",
      metadata: { userId: "user_test", plan: "pro", billing: "monthly" },
      subscription: "sub_test",
    };

    stripe.webhooks.constructEvent.mockReturnValue(makeEvent("checkout.session.completed", sessionWithoutUtm, "evt_no_utm"));
    stripe.subscriptions.retrieve.mockResolvedValue(makeSubscription({ id: "sub_test" }));

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(mockTrackServerEvent).toHaveBeenCalledWith("subscription_started", {
      source: "stripe_checkout",
      tier: "pro",
      billing: "monthly",
    });
  });
});
