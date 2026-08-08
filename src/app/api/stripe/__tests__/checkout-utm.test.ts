/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

import { POST } from "../checkout/route";
import { alertAdmins } from "@/lib/admin-alerts";
import {
  getStoredSubscriptionSnapshot,
  hasProcessedStripeEvent,
  markStripeEventProcessed,
  saveSubscriptionSnapshot,
  stripeSubscriptionPeriodEnd,
  tierFromPriceId,
} from "@/lib/billing-store";
import { isDatabaseConfigured, query } from "@/lib/db";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import { trackServerEvent } from "@/lib/server-analytics";
import { getStripe } from "@/lib/stripe";
import { auth, currentUser } from "@clerk/nextjs/server";

jest.mock("@clerk/nextjs/server", () => ({
  auth: jest.fn(),
  currentUser: jest.fn(),
}));

jest.mock("@/lib/admin-alerts", () => ({
  alertAdmins: jest.fn(),
}));

jest.mock("@/lib/billing-store", () => ({
  getStoredSubscriptionSnapshot: jest.fn(),
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

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true }),
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

const mockAuth = jest.mocked(auth);
const mockCurrentUser = jest.mocked(currentUser);
const mockAlertAdmins = jest.mocked(alertAdmins);
const mockGetStoredSubscriptionSnapshot = jest.mocked(getStoredSubscriptionSnapshot);
const mockGetRedis = jest.mocked(getRedis);
const mockIsRedisConfigured = jest.mocked(isRedisConfigured);
const mockTrackServerEvent = jest.mocked(trackServerEvent);
const mockGetStripe = jest.mocked(getStripe);

type StripeMock = {
  customers: { list: jest.Mock; search: jest.Mock; retrieve: jest.Mock };
  checkout: { sessions: { create: jest.Mock } };
  billingPortal: { sessions: { create: jest.Mock } };
  subscriptions: { list: jest.Mock };
};

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://getquickfill.com/api/stripe/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function clearPricingV2Env() {
  delete process.env.NEXT_PUBLIC_QUICKFILL_PRICING_V2;
  delete process.env.NEXT_PUBLIC_QUICKFILL_SALE_ENDS;
  delete process.env.STRIPE_PRO_ANNUAL_V2_PRICE_ID;
  delete process.env.STRIPE_PRO_ANNUAL_SALE_PRICE_ID;
}

function enablePricingV2(saleEnds = "2999-01-01T00:00:00.000Z") {
  process.env.NEXT_PUBLIC_QUICKFILL_PRICING_V2 = "v1";
  process.env.NEXT_PUBLIC_QUICKFILL_SALE_ENDS = saleEnds;
  process.env.STRIPE_PRO_ANNUAL_V2_PRICE_ID = "price_pro_annual_v2";
  process.env.STRIPE_PRO_ANNUAL_SALE_PRICE_ID = "price_pro_annual_sale";
}

afterEach(() => {
  clearPricingV2Env();
});

describe("Stripe checkout UTM attribution", () => {
  let stripe: StripeMock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearPricingV2Env();

    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = "price_pro_monthly";
    process.env.STRIPE_PRO_MONTHLY_INTRO_PRICE_ID = "price_pro_monthly_intro";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_monthly_rollback";
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID = "price_pro_annual";
    process.env.STRIPE_BUSINESS_PRICE_ID = "price_business_monthly";
    process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID = "price_business_annual";

    stripe = {
      customers: {
        list: jest.fn().mockResolvedValue({ data: [] }),
        search: jest.fn().mockResolvedValue({ data: [] }),
        retrieve: jest.fn(),
      },
      checkout: {
        sessions: {
          create: jest.fn(),
        },
      },
      billingPortal: {
        sessions: {
          create: jest.fn(),
        },
      },
      subscriptions: {
        list: jest.fn().mockResolvedValue({ data: [] }),
      },
    };

    mockGetStripe.mockReturnValue(stripe as never);
    mockAuth.mockResolvedValue({ userId: "user_test" } as never);
    mockCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "user@example.com" },
      firstName: "Test",
    } as never);
    mockGetStoredSubscriptionSnapshot.mockResolvedValue(null);
    mockIsRedisConfigured.mockReturnValue(false);
    mockTrackServerEvent.mockResolvedValue(true);
    mockAlertAdmins.mockResolvedValue(undefined);
    stripe.checkout.sessions.create.mockResolvedValue({
      url: "https://checkout.stripe.com/test",
    } as never);
  });

  it("POST body with UTM values -> Stripe session created with UTM in metadata", async () => {
    const requestBody = {
      plan: "pro",
      annual: true,
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "summer_sale",
      utm_content: "banner_ad",
      utm_term: "pdf_form_software",
    };

    const response = await POST(makeRequest(requestBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ url: "https://checkout.stripe.com/test" });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          userId: "user_test",
          plan: "pro",
          billing: "annual",
          firstName: "Test",
          utm_source: "google",
          utm_medium: "cpc",
          utm_campaign: "summer_sale",
          utm_content: "banner_ad",
          utm_term: "pdf_form_software",
        }),
        subscription_data: expect.objectContaining({
          metadata: expect.objectContaining({
            userId: "user_test",
            plan: "pro",
            billing: "annual",
            firstName: "Test",
            utm_source: "google",
            utm_medium: "cpc",
            utm_campaign: "summer_sale",
            utm_content: "banner_ad",
            utm_term: "pdf_form_software",
          }),
        }),
      }),
    );
  });

  it("POST body without UTM -> Stripe session created without UTM keys", async () => {
    const requestBody = {
      plan: "pro",
      annual: false,
    };

    const response = await POST(makeRequest(requestBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ url: "https://checkout.stripe.com/test" });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          userId: "user_test",
          plan: "pro",
          billing: "monthly",
          firstName: "Test",
        }),
        subscription_data: expect.objectContaining({
          metadata: expect.objectContaining({
            userId: "user_test",
            plan: "pro",
            billing: "monthly",
            firstName: "Test",
          }),
        }),
      }),
    );

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.metadata.utm_source).toBeUndefined();
    expect(callArgs.metadata.utm_medium).toBeUndefined();
    expect(callArgs.metadata.utm_campaign).toBeUndefined();
    expect(callArgs.metadata.utm_content).toBeUndefined();
    expect(callArgs.metadata.utm_term).toBeUndefined();
  });

  it("POST body with UTM values that are empty strings -> filtered out (not stored in metadata)", async () => {
    const requestBody = {
      plan: "pro",
      annual: true,
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
    };

    const response = await POST(makeRequest(requestBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ url: "https://checkout.stripe.com/test" });

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.metadata.utm_source).toBeUndefined();
    expect(callArgs.metadata.utm_medium).toBeUndefined();
    expect(callArgs.metadata.utm_campaign).toBeUndefined();
  });

  it("POST body with UTM values longer than 100 chars -> truncated to 100 chars", async () => {
    const longValue = "a".repeat(150);
    const requestBody = {
      plan: "pro",
      annual: false,
      utm_source: longValue,
    };

    const response = await POST(makeRequest(requestBody));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ url: "https://checkout.stripe.com/test" });

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.metadata.utm_source).toHaveLength(100);
    expect(callArgs.metadata.utm_source).toBe("a".repeat(100));
  });

  it("POST body with gclid and UTM values -> Stripe session metadata includes both", async () => {
    const response = await POST(makeRequest({
      plan: "pro",
      annual: true,
      utm_source: "google",
      utm_medium: "cpc",
      gclid: "test-click-id",
    }));

    expect(response.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          utm_source: "google",
          utm_medium: "cpc",
          gclid: "test-click-id",
        }),
      }),
    );
  });

  it("POST body with long gclid -> preserves beyond 100 chars and caps at 500", async () => {
    const longClickId = "g".repeat(450);

    const response = await POST(makeRequest({
      plan: "pro",
      annual: false,
      gclid: longClickId,
    }));

    expect(response.status).toBe(200);
    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.metadata.gclid).toHaveLength(450);
    expect(callArgs.metadata.gclid).toBe(longClickId);
  });

  it("POST body with empty or undefined click IDs -> filters them out", async () => {
    const response = await POST(makeRequest({
      plan: "pro",
      annual: false,
      gclid: "",
      gbraid: undefined,
      wbraid: "valid-wbraid",
    }));

    expect(response.status).toBe(200);
    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.metadata.gclid).toBeUndefined();
    expect(callArgs.metadata.gbraid).toBeUndefined();
    expect(callArgs.metadata.wbraid).toBe("valid-wbraid");
  });

  it("POST body with gclid -> includes it in subscription metadata", async () => {
    const response = await POST(makeRequest({
      plan: "pro",
      annual: true,
      gclid: "subscription-click-id",
    }));

    expect(response.status).toBe(200);
    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.subscription_data.metadata.gclid).toBe("subscription-click-id");
  });
});

describe("Stripe checkout Pro offer", () => {
  let stripe: StripeMock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearPricingV2Env();

    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = "price_pro_monthly";
    process.env.STRIPE_PRO_MONTHLY_INTRO_PRICE_ID = "price_pro_monthly_intro";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_monthly_rollback";
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID = "price_pro_annual";
    process.env.STRIPE_BUSINESS_PRICE_ID = "price_business_monthly";
    process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID = "price_business_annual";
    process.env.STRIPE_PRO_INTRO_COUPON_ID = "coupon_intro_1250";

    stripe = {
      customers: {
        list: jest.fn().mockResolvedValue({ data: [] }),
        search: jest.fn().mockResolvedValue({ data: [] }),
        retrieve: jest.fn(),
      },
      checkout: { sessions: { create: jest.fn() } },
      billingPortal: { sessions: { create: jest.fn() } },
      subscriptions: { list: jest.fn().mockResolvedValue({ data: [] }) },
    };

    mockGetStripe.mockReturnValue(stripe as never);
    mockAuth.mockResolvedValue({ userId: "user_test" } as never);
    mockCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "user@example.com" },
      firstName: "Test",
    } as never);
    mockGetStoredSubscriptionSnapshot.mockResolvedValue(null);
    mockIsRedisConfigured.mockReturnValue(false);
    mockGetRedis.mockReturnValue({ get: jest.fn(), set: jest.fn() } as never);
    mockTrackServerEvent.mockResolvedValue(true);
    mockAlertAdmins.mockResolvedValue(undefined as never);
    stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
  });

  it("Pro monthly uses intro price, recurring monthly price, and a 7 day trial", async () => {
    const response = await POST(makeRequest({ plan: "pro", annual: false }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.line_items).toEqual([
      { price: "price_pro_monthly_intro", quantity: 1 },
      { price: "price_pro_monthly", quantity: 1 },
    ]);
    expect(callArgs.subscription_data).toEqual(expect.objectContaining({
      trial_period_days: 7,
      metadata: expect.objectContaining({
        userId: "user_test",
        plan: "pro",
        billing: "monthly",
      }),
    }));
  });

  it("Pro monthly new offer does not send discounts or allow promotion codes", async () => {
    const response = await POST(makeRequest({ plan: "pro", annual: false }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.discounts).toBeUndefined();
    expect(callArgs.allow_promotion_codes).toBeUndefined();
  });

  it("Pro annual uses annual price only and no trial", async () => {
    const response = await POST(makeRequest({ plan: "pro", annual: true }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.line_items).toEqual([{ price: "price_pro_annual", quantity: 1 }]);
    expect(callArgs.subscription_data.trial_period_days).toBeUndefined();
    expect(callArgs.discounts).toBeUndefined();
  });

  it("Pricing V2 annual moves the A$2 intro and 7 day trial to the new annual price", async () => {
    enablePricingV2();

    const response = await POST(makeRequest({ plan: "pro", annual: true, billing: "annual" }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.line_items).toEqual([
      { price: "price_pro_monthly_intro", quantity: 1 },
      { price: "price_pro_annual_v2", quantity: 1 },
    ]);
    expect(callArgs.subscription_data).toEqual(expect.objectContaining({
      trial_period_days: 7,
      metadata: expect.objectContaining({ billing: "annual" }),
    }));
    expect(callArgs.discounts).toBeUndefined();
    expect(callArgs.allow_promotion_codes).toBeUndefined();
  });

  it("Pricing V2 monthly uses one monthly price with no intro or trial", async () => {
    enablePricingV2();

    const response = await POST(makeRequest({ plan: "pro", annual: false, billing: "monthly" }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.line_items).toEqual([{ price: "price_pro_monthly", quantity: 1 }]);
    expect(callArgs.subscription_data).toEqual(expect.objectContaining({
      metadata: expect.objectContaining({ billing: "monthly" }),
    }));
    expect(callArgs.subscription_data.trial_period_days).toBeUndefined();
    expect(callArgs.discounts).toBeUndefined();
    expect(callArgs.allow_promotion_codes).toBeUndefined();
  });

  it("Pricing V2 sale uses the locked annual sale price only while its window is open", async () => {
    enablePricingV2();

    const response = await POST(makeRequest({ plan: "pro", billing: "sale" }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.line_items).toEqual([{ price: "price_pro_annual_sale", quantity: 1 }]);
    expect(callArgs.subscription_data).toEqual(expect.objectContaining({
      metadata: expect.objectContaining({ billing: "sale" }),
    }));
    expect(callArgs.subscription_data.trial_period_days).toBeUndefined();
    expect(callArgs.discounts).toBeUndefined();
    expect(callArgs.allow_promotion_codes).toBeUndefined();
  });

  it.each([
    ["absent", undefined],
    ["invalid", "not-a-date"],
    ["past", "2000-01-01T00:00:00.000Z"],
  ])("Pricing V2 rejects a sale with an %s sale window", async (_label, saleEnds) => {
    enablePricingV2();
    if (saleEnds === undefined) {
      delete process.env.NEXT_PUBLIC_QUICKFILL_SALE_ENDS;
    } else {
      process.env.NEXT_PUBLIC_QUICKFILL_SALE_ENDS = saleEnds;
    }

    const response = await POST(makeRequest({ plan: "pro", billing: "sale" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "This sale offer is no longer available.",
      code: "checkout_sale_unavailable",
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(mockAlertAdmins).not.toHaveBeenCalled();
  });

  it.each([
    ["STRIPE_PRO_MONTHLY_INTRO_PRICE_ID", "STRIPE_PRO_MONTHLY_INTRO_PRICE_ID"],
    ["STRIPE_PRO_ANNUAL_V2_PRICE_ID", "STRIPE_PRO_ANNUAL_V2_PRICE_ID"],
  ])("Pricing V2 annual fails closed and alerts when %s is missing", async (envName, missingEnv) => {
    enablePricingV2();
    delete process.env[envName];

    const response = await POST(makeRequest({ plan: "pro", annual: true, billing: "annual" }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "pro annual billing is not configured yet.",
      code: "checkout_price_missing",
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(mockAlertAdmins).toHaveBeenCalledWith(expect.objectContaining({
      title: "Stripe checkout price is not configured",
      fields: expect.objectContaining({ billing: "annual", missingEnv }),
    }));
  });

  it("Pricing V2 sale fails closed and alerts when its Stripe price is missing", async () => {
    enablePricingV2();
    delete process.env.STRIPE_PRO_ANNUAL_SALE_PRICE_ID;

    const response = await POST(makeRequest({ plan: "pro", billing: "sale" }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "pro sale billing is not configured yet.",
      code: "checkout_price_missing",
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(mockAlertAdmins).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.objectContaining({
        billing: "sale",
        missingEnv: "STRIPE_PRO_ANNUAL_SALE_PRICE_ID",
      }),
    }));
  });

  it("flag-off ignores billing=sale and keeps the existing monthly trial flow", async () => {
    const response = await POST(makeRequest({ plan: "pro", annual: false, billing: "sale" }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.line_items).toEqual([
      { price: "price_pro_monthly_intro", quantity: 1 },
      { price: "price_pro_monthly", quantity: 1 },
    ]);
    expect(callArgs.subscription_data).toEqual(expect.objectContaining({
      trial_period_days: 7,
      metadata: expect.objectContaining({ billing: "monthly" }),
    }));
  });

  it("Pricing V2 leaves the Business annual offer unchanged", async () => {
    enablePricingV2();

    const response = await POST(makeRequest({
      plan: "business",
      annual: true,
      billing: "sale",
    }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.line_items).toEqual([{ price: "price_business_annual", quantity: 1 }]);
    expect(callArgs.metadata.billing).toBe("annual");
    expect(callArgs.allow_promotion_codes).toBe(true);
  });

  it("Business -> uses allow_promotion_codes and no discount", async () => {
    const response = await POST(makeRequest({ plan: "business", annual: false }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.allow_promotion_codes).toBe(true);
    expect(callArgs.discounts).toBeUndefined();
  });

  it("Pro monthly rollback path uses old coupon only when intro price env is absent", async () => {
    delete process.env.STRIPE_PRO_MONTHLY_INTRO_PRICE_ID;

    const response = await POST(makeRequest({ plan: "pro", annual: false }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.discounts).toEqual([{ coupon: "coupon_intro_1250" }]);
    expect(callArgs.allow_promotion_codes).toBeUndefined();
    expect(callArgs.line_items).toEqual([{ price: "price_pro_monthly_rollback", quantity: 1 }]);
    expect(callArgs.subscription_data.trial_period_days).toBeUndefined();
  });

  it("logs checkout_start with the client checkout source", async () => {
    const response = await POST(
      makeRequest({ plan: "pro", annual: false, source: "download_preview_gate" })
    );
    expect(response.status).toBe(200);

    expect(mockTrackServerEvent).toHaveBeenCalledWith("checkout_start", {
      source: "download_preview_gate",
      plan: "pro",
      billing: "monthly",
    });
  });

  it("logs checkout_start with default source when none is sent", async () => {
    const response = await POST(makeRequest({ plan: "pro", annual: false }));
    expect(response.status).toBe(200);

    expect(mockTrackServerEvent).toHaveBeenCalledWith("checkout_start", {
      source: "checkout",
      plan: "pro",
      billing: "monthly",
    });
  });

  it("returns the successful checkout response when analytics returns false", async () => {
    mockTrackServerEvent.mockResolvedValue(false);

    const response = await POST(makeRequest({ plan: "pro", annual: false }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ url: "https://checkout.stripe.com/test" });
    expect(mockTrackServerEvent).toHaveBeenCalledWith("checkout_start", {
      source: "checkout",
      plan: "pro",
      billing: "monthly",
    });
    expect(mockAlertAdmins).not.toHaveBeenCalled();
  });

  it("keeps a genuine Stripe checkout failure as a failure", async () => {
    stripe.checkout.sessions.create.mockRejectedValue(new Error("Stripe unavailable"));

    const response = await POST(makeRequest({ plan: "pro", annual: false }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Checkout could not be started. Please contact support if this keeps happening.",
      code: "checkout_unexpected_failure",
    });
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
    expect(mockAlertAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Stripe checkout could not be started" }),
    );
  });

  it("download gate checkouts cancel back to /editor?download=cancelled", async () => {
    const response = await POST(
      makeRequest({ plan: "pro", annual: false, source: "download_preview_gate" })
    );
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.cancel_url).toBe("https://getquickfill.com/editor?download=cancelled");
  });

  it("mobile download gate checkouts also cancel back to /editor?download=cancelled", async () => {
    const response = await POST(
      makeRequest({ plan: "pro", annual: false, source: "download_preview_gate_mobile" })
    );
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.cancel_url).toBe("https://getquickfill.com/editor?download=cancelled");
    expect(mockTrackServerEvent).toHaveBeenCalledWith("checkout_start", {
      source: "download_preview_gate_mobile",
      plan: "pro",
      billing: "monthly",
    });
  });
});
