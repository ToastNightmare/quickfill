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

describe("Stripe checkout UTM attribution", () => {
  let stripe: StripeMock;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.STRIPE_PRO_PRICE_ID = "price_pro_monthly";
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
    mockTrackServerEvent.mockResolvedValue(undefined);
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

describe("Stripe checkout intro coupon (Pro monthly)", () => {
  let stripe: StripeMock;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.STRIPE_PRO_PRICE_ID = "price_pro_monthly";
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
    mockTrackServerEvent.mockResolvedValue(undefined as never);
    mockAlertAdmins.mockResolvedValue(undefined as never);
    stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
  });

  it("Pro monthly with coupon env set -> applies discount and omits allow_promotion_codes", async () => {
    const response = await POST(makeRequest({ plan: "pro", annual: false }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.discounts).toEqual([{ coupon: "coupon_intro_1250" }]);
    expect(callArgs.allow_promotion_codes).toBeUndefined();
    expect(callArgs.line_items).toEqual([{ price: "price_pro_monthly", quantity: 1 }]);
  });

  it("Pro annual -> uses allow_promotion_codes and no discount", async () => {
    const response = await POST(makeRequest({ plan: "pro", annual: true }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.allow_promotion_codes).toBe(true);
    expect(callArgs.discounts).toBeUndefined();
    expect(callArgs.line_items).toEqual([{ price: "price_pro_annual", quantity: 1 }]);
  });

  it("Business -> uses allow_promotion_codes and no discount", async () => {
    const response = await POST(makeRequest({ plan: "business", annual: false }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.allow_promotion_codes).toBe(true);
    expect(callArgs.discounts).toBeUndefined();
  });

  it("Pro monthly fallback when coupon env missing -> creates checkout safely with promo codes", async () => {
    delete process.env.STRIPE_PRO_INTRO_COUPON_ID;

    const response = await POST(makeRequest({ plan: "pro", annual: false }));
    expect(response.status).toBe(200);

    const callArgs = (stripe.checkout.sessions.create as jest.Mock).mock.calls[0][0];
    expect(callArgs.allow_promotion_codes).toBe(true);
    expect(callArgs.discounts).toBeUndefined();
    expect(callArgs.line_items).toEqual([{ price: "price_pro_monthly", quantity: 1 }]);
  });
});
