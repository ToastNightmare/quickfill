import { isDatabaseConfigured, query } from "../db";
import { getRedis, isRedisConfigured } from "../redis";
import { getStripe } from "../stripe";
import { isSubscriptionEntitled, saveSubscriptionSnapshot, stripeSubscriptionPeriodEnd, tierFromPriceId } from "../billing-store";
import { reconcileStripeBilling, reconcileStripeBillingForUser, subscriptionTier } from "../billing-reconciliation";

jest.mock("../db", () => ({
  isDatabaseConfigured: jest.fn(),
  query: jest.fn(),
}));

jest.mock("../redis", () => ({
  getRedis: jest.fn(),
  isRedisConfigured: jest.fn(),
}));

jest.mock("../stripe", () => ({
  getStripe: jest.fn(),
}));

jest.mock("../billing-store", () => ({
  isSubscriptionEntitled: jest.fn(),
  saveSubscriptionSnapshot: jest.fn(),
  stripeSubscriptionPeriodEnd: jest.fn(),
  tierFromPriceId: jest.fn(),
}));

const mockIsDatabaseConfigured = jest.mocked(isDatabaseConfigured);
const mockIsRedisConfigured = jest.mocked(isRedisConfigured);
const mockGetRedis = jest.mocked(getRedis);
const mockQuery = jest.mocked(query);
const mockGetStripe = jest.mocked(getStripe);
const mockIsSubscriptionEntitled = jest.mocked(isSubscriptionEntitled);
const mockSaveSubscriptionSnapshot = jest.mocked(saveSubscriptionSnapshot);
const mockStripeSubscriptionPeriodEnd = jest.mocked(stripeSubscriptionPeriodEnd);
const mockTierFromPriceId = jest.mocked(tierFromPriceId);

const stripe = {
  customers: {
    list: jest.fn(),
    search: jest.fn(),
    retrieve: jest.fn(),
  },
  subscriptions: {
    retrieve: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
  },
  checkout: {
    sessions: {
      list: jest.fn(),
    },
  },
};

const redis = {
  get: jest.fn(),
  scan: jest.fn(),
};

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    current_period_end: 1770768000,
    created: 1770000000,
    metadata: { plan: "pro" },
    items: { data: [{ price: { id: "price_pro" } }] },
    ...overrides,
  } as never;
}

describe("Stripe billing reconciliation", () => {
  const originalStripeSecret = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    mockIsDatabaseConfigured.mockReturnValue(true);
    mockIsRedisConfigured.mockReturnValue(true);
    mockGetRedis.mockReturnValue(redis as never);
    mockGetStripe.mockReturnValue(stripe as never);
    mockTierFromPriceId.mockReturnValue("pro");
    mockIsSubscriptionEntitled.mockReturnValue(true);
    mockStripeSubscriptionPeriodEnd.mockReturnValue(1770768000);
    stripe.customers.list.mockResolvedValue({ data: [] });
    stripe.customers.search.mockResolvedValue({ data: [] });
    stripe.customers.retrieve.mockResolvedValue({ id: "cus_123", email: null, deleted: false });
    stripe.subscriptions.list.mockResolvedValue({ data: [] });
    stripe.subscriptions.update.mockResolvedValue({});
    stripe.checkout.sessions.list.mockResolvedValue({ data: [] });
    redis.get.mockResolvedValue(null);
    redis.scan.mockResolvedValue(["0", []]);
  });

  afterAll(() => {
    process.env.STRIPE_SECRET_KEY = originalStripeSecret;
  });

  it("does not scan stored billing when the database is unavailable", async () => {
    mockIsDatabaseConfigured.mockReturnValue(false);

    await expect(reconcileStripeBilling()).resolves.toMatchObject({
      ok: false,
      checked: 0,
      message: "DATABASE_URL is not configured; scheduled billing reconciliation cannot scan stored subscriptions.",
    });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("refreshes stored billing from the current Stripe subscription", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        user_id: "user_123",
        tier: "pro",
        status: "active",
        current_period_end: new Date("2026-05-12T00:00:00.000Z"),
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        updated_at: new Date("2026-05-12T00:00:00.000Z"),
      },
    ] as never);
    stripe.subscriptions.retrieve.mockResolvedValueOnce(subscription({ status: "past_due", current_period_end: 1770768000 }));
    mockIsSubscriptionEntitled.mockReturnValueOnce(false);

    await expect(reconcileStripeBilling({ limit: 10 })).resolves.toMatchObject({
      ok: true,
      checked: 1,
      updated: 1,
      downgraded: 1,
      skipped: 0,
    });

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_123");
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith({
      userId: "user_123",
      customerId: "cus_123",
      subscriptionId: "sub_123",
      tier: "pro",
      status: "past_due",
      currentPeriodEnd: 1770768000,
    });
  });

  it("falls back to the latest Stripe customer subscription when only a customer id is stored", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        user_id: "user_123",
        tier: "free",
        status: "unknown",
        current_period_end: null,
        stripe_customer_id: "cus_123",
        stripe_subscription_id: null,
        updated_at: null,
      },
    ] as never);
    stripe.subscriptions.list.mockResolvedValueOnce({
      data: [
        subscription({ id: "sub_old", created: 1760000000, status: "canceled" }),
        subscription({ id: "sub_new", created: 1770000000, status: "active", metadata: { plan: "business" } }),
      ],
    });

    await expect(reconcileStripeBilling()).resolves.toMatchObject({ ok: true, checked: 1, updated: 1 });

    expect(stripe.subscriptions.list).toHaveBeenCalledWith({ customer: "cus_123", status: "all", limit: 10 });
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub_new", tier: "business", status: "active" }),
    );
  });

  it("recovers user billing from Stripe email when the local billing record is missing", async () => {
    mockQuery.mockResolvedValueOnce([] as never);
    stripe.customers.list.mockResolvedValueOnce({ data: [{ id: "cus_from_email" }] });
    stripe.subscriptions.list.mockResolvedValueOnce({
      data: [subscription({ id: "sub_from_email", customer: "cus_from_email", status: "active" })],
    });
    stripe.subscriptions.retrieve.mockResolvedValueOnce(
      subscription({ id: "sub_from_email", customer: "cus_from_email", status: "active" }),
    );

    await expect(reconcileStripeBillingForUser("user_123", { email: "User@Example.com" })).resolves.toMatchObject({
      ok: true,
      checked: 1,
      updated: 1,
      skipped: 0,
    });

    expect(stripe.customers.list).toHaveBeenCalledWith({ email: "user@example.com", limit: 10 });
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_123", customerId: "cus_from_email", subscriptionId: "sub_from_email" }),
    );
  });

  it("recovers user billing from Stripe email without a database when Redis is available", async () => {
    mockIsDatabaseConfigured.mockReturnValue(false);
    mockIsRedisConfigured.mockReturnValue(true);
    stripe.customers.list.mockResolvedValueOnce({ data: [{ id: "cus_from_email" }] });
    stripe.subscriptions.list.mockResolvedValueOnce({
      data: [subscription({ id: "sub_from_email", customer: "cus_from_email", status: "active" })],
    });
    stripe.subscriptions.retrieve.mockResolvedValueOnce(
      subscription({ id: "sub_from_email", customer: "cus_from_email", status: "active" }),
    );

    await expect(reconcileStripeBillingForUser("user_123", { email: "User@Example.com" })).resolves.toMatchObject({
      ok: true,
      checked: 1,
      updated: 1,
    });

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_123", customerId: "cus_from_email", subscriptionId: "sub_from_email" }),
    );
  });

  it("uses Stripe customer search when the exact email list lookup misses", async () => {
    mockQuery.mockResolvedValueOnce([] as never);
    stripe.customers.list.mockResolvedValueOnce({ data: [] });
    stripe.customers.search.mockResolvedValueOnce({ data: [{ id: "cus_search" }] });
    stripe.subscriptions.list.mockResolvedValueOnce({
      data: [subscription({ id: "sub_search", customer: "cus_search", status: "active" })],
    });
    stripe.subscriptions.retrieve.mockResolvedValueOnce(
      subscription({ id: "sub_search", customer: "cus_search", status: "active" }),
    );

    await expect(reconcileStripeBillingForUser("user_123", { email: "User@Example.com" })).resolves.toMatchObject({
      ok: true,
      checked: 1,
      updated: 1,
    });

    expect(stripe.customers.search).toHaveBeenCalledWith({ query: 'email:"user@example.com"', limit: 10 });
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_123", customerId: "cus_search", subscriptionId: "sub_search" }),
    );
  });

  it("recovers user billing from checkout history when the Stripe customer has no email", async () => {
    mockQuery.mockResolvedValueOnce([] as never);
    stripe.customers.list.mockResolvedValueOnce({ data: [] });
    stripe.customers.search.mockResolvedValueOnce({ data: [] });
    stripe.subscriptions.list.mockResolvedValueOnce({
      data: [
        subscription({
          id: "sub_orphan",
          customer: "cus_orphan",
          status: "active",
          metadata: {},
        }),
      ],
    });
    stripe.checkout.sessions.list.mockResolvedValueOnce({
      data: [
        {
          id: "cs_orphan",
          customer: "cus_orphan",
          customer_email: null,
          customer_details: { email: "user@example.com" },
          metadata: { plan: "pro" },
        },
      ],
    });
    stripe.subscriptions.retrieve.mockResolvedValueOnce(
      subscription({ id: "sub_orphan", customer: "cus_orphan", status: "active", metadata: {} }),
    );

    await expect(reconcileStripeBillingForUser("user_123", { email: "User@Example.com" })).resolves.toMatchObject({
      ok: true,
      checked: 1,
      updated: 1,
    });

    expect(stripe.subscriptions.list).toHaveBeenCalledWith({ status: "all", limit: 100 });
    expect(stripe.checkout.sessions.list).toHaveBeenCalledWith({ subscription: "sub_orphan", limit: 10 });
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_123", customerId: "cus_orphan", subscriptionId: "sub_orphan" }),
    );
  });

  it("recovers user billing from subscription metadata in checkout-history scans", async () => {
    mockQuery.mockResolvedValueOnce([] as never);
    stripe.customers.list.mockResolvedValueOnce({ data: [] });
    stripe.customers.search.mockResolvedValueOnce({ data: [] });
    stripe.subscriptions.list.mockResolvedValueOnce({
      data: [
        subscription({
          id: "sub_metadata",
          customer: "cus_metadata",
          status: "active",
          metadata: { userId: "user_123", plan: "pro" },
        }),
      ],
    });
    stripe.subscriptions.retrieve.mockResolvedValueOnce(
      subscription({
        id: "sub_metadata",
        customer: "cus_metadata",
        status: "active",
        metadata: { userId: "user_123", plan: "pro" },
      }),
    );

    await expect(reconcileStripeBillingForUser("user_123")).resolves.toMatchObject({
      ok: true,
      checked: 1,
      updated: 1,
    });

    expect(stripe.checkout.sessions.list).not.toHaveBeenCalled();
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_123", customerId: "cus_metadata", subscriptionId: "sub_metadata" }),
    );
  });

  it("recovers user billing from a cached Stripe customer mapping", async () => {
    mockQuery.mockResolvedValueOnce([] as never);
    redis.get.mockResolvedValueOnce("cus_cached");
    stripe.subscriptions.list.mockResolvedValueOnce({
      data: [subscription({ id: "sub_cached", customer: "cus_cached", status: "active" })],
    });

    await expect(reconcileStripeBillingForUser("user_123")).resolves.toMatchObject({
      ok: true,
      checked: 1,
      updated: 1,
      skipped: 0,
    });

    expect(redis.get).toHaveBeenCalledWith("stripe_customer:user_123");
    expect(stripe.subscriptions.list).toHaveBeenCalledWith({ customer: "cus_cached", status: "all", limit: 10 });
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_123", customerId: "cus_cached", subscriptionId: "sub_cached" }),
    );
  });

  it("returns green when Redis customer repair succeeds after a database lookup error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("database lookup failed"));
    redis.get.mockResolvedValueOnce("cus_cached");
    stripe.subscriptions.list.mockResolvedValueOnce({
      data: [subscription({ id: "sub_cached", customer: "cus_cached", status: "active" })],
    });

    await expect(reconcileStripeBillingForUser("user_123")).resolves.toMatchObject({
      ok: true,
      checked: 1,
      updated: 1,
      skipped: 0,
      errors: [],
    });
  });

  it("clears stale cached customer access when Stripe has no subscription", async () => {
    mockQuery.mockResolvedValueOnce([] as never);
    redis.get.mockResolvedValueOnce("cus_empty");
    stripe.subscriptions.list.mockResolvedValueOnce({ data: [] });

    await expect(reconcileStripeBillingForUser("user_123")).resolves.toMatchObject({
      ok: true,
      checked: 1,
      updated: 1,
      downgraded: 1,
      skipped: 0,
      errors: [],
    });

    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith({
      userId: "user_123",
      customerId: "cus_empty",
      subscriptionId: null,
      tier: "free",
      status: "canceled",
      currentPeriodEnd: null,
    });
  });

  it("repairs all users from cached Stripe customer mappings during scheduled sync", async () => {
    mockQuery.mockResolvedValueOnce([] as never);
    redis.scan.mockResolvedValueOnce(["0", ["stripe_customer:user_cached", "stripe_customer_user:cus_cached"]]);
    redis.get.mockResolvedValueOnce("cus_cached");
    stripe.subscriptions.list
      .mockResolvedValueOnce({
        data: [subscription({ id: "sub_cached", customer: "cus_cached", status: "active" })],
      })
      .mockResolvedValueOnce({ data: [] });

    await expect(reconcileStripeBilling()).resolves.toMatchObject({
      ok: true,
      checked: 1,
      updated: 1,
      skipped: 0,
    });

    expect(redis.scan).toHaveBeenCalledWith("0", { match: "stripe_customer:*", count: 100 });
    expect(redis.get).toHaveBeenCalledWith("stripe_customer:user_cached");
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_cached", customerId: "cus_cached", subscriptionId: "sub_cached" }),
    );
  });

  it("prefers a live customer subscription over a stale stored subscription id", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        user_id: "user_123",
        tier: "pro",
        status: "canceled",
        current_period_end: new Date("2026-05-12T00:00:00.000Z"),
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_old",
        updated_at: new Date("2026-05-12T00:00:00.000Z"),
      },
    ] as never);
    stripe.subscriptions.retrieve.mockResolvedValueOnce(subscription({ id: "sub_old", created: 1760000000, status: "canceled" }));
    stripe.subscriptions.list.mockResolvedValueOnce({
      data: [
        subscription({ id: "sub_old", created: 1760000000, status: "canceled" }),
        subscription({ id: "sub_new", created: 1770000000, status: "trialing", metadata: { plan: "pro" } }),
      ],
    });

    await expect(reconcileStripeBilling()).resolves.toMatchObject({ ok: true, checked: 1, updated: 1 });

    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub_new", tier: "pro", status: "trialing" }),
    );
  });

  it("keeps records visible for review when Stripe cannot be reached", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        user_id: "user_123",
        tier: "pro",
        status: "active",
        current_period_end: null,
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        updated_at: null,
      },
    ] as never);
    stripe.subscriptions.retrieve.mockRejectedValueOnce(new Error("Stripe timeout"));

    await expect(reconcileStripeBilling()).resolves.toMatchObject({
      ok: false,
      checked: 1,
      updated: 0,
      skipped: 1,
      errors: [expect.objectContaining({ message: "Stripe timeout" })],
    });

    expect(mockSaveSubscriptionSnapshot).not.toHaveBeenCalled();
  });

  it("repairs active Stripe subscriptions missing from local billing records when checkout metadata has the user", async () => {
    mockQuery.mockResolvedValueOnce([] as never);
    const orphan = subscription({
      id: "sub_orphan",
      customer: "cus_orphan",
      status: "active",
      metadata: {},
    });
    stripe.subscriptions.list.mockResolvedValueOnce({ data: [orphan] });
    stripe.checkout.sessions.list.mockResolvedValueOnce({
      data: [{ id: "cs_orphan", customer: "cus_orphan", metadata: { userId: "user_from_checkout", plan: "pro" } }],
    });
    stripe.subscriptions.retrieve.mockResolvedValueOnce(orphan);

    await expect(reconcileStripeBilling()).resolves.toMatchObject({
      ok: true,
      checked: 1,
      updated: 1,
      skipped: 0,
    });

    expect(stripe.checkout.sessions.list).toHaveBeenCalledWith({ subscription: "sub_orphan", limit: 10 });
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_from_checkout",
        customerId: "cus_orphan",
        subscriptionId: "sub_orphan",
        tier: "pro",
      }),
    );
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_orphan", {
      metadata: { userId: "user_from_checkout", plan: "pro" },
    });
  });

  it("repairs active Stripe subscriptions by matching checkout email to stored app users", async () => {
    mockQuery
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ clerk_user_id: "user_from_email" }] as never);
    const orphan = subscription({
      id: "sub_email",
      customer: "cus_email",
      status: "active",
      metadata: {},
    });
    stripe.subscriptions.list.mockResolvedValueOnce({ data: [orphan] });
    stripe.checkout.sessions.list.mockResolvedValueOnce({
      data: [
        {
          id: "cs_email",
          customer: "cus_email",
          customer_email: null,
          customer_details: { email: "paid@example.com" },
          metadata: { plan: "pro" },
        },
      ],
    });
    stripe.subscriptions.retrieve.mockResolvedValueOnce(orphan);

    await expect(reconcileStripeBilling()).resolves.toMatchObject({
      ok: true,
      checked: 1,
      updated: 1,
    });

    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("from app_users"),
      ["paid@example.com"],
    );
    expect(mockSaveSubscriptionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_from_email", customerId: "cus_email", subscriptionId: "sub_email" }),
    );
  });

  it("uses metadata plan before falling back to price ids", () => {
    expect(subscriptionTier(subscription({ metadata: { plan: "business" } }), "pro")).toBe("business");

    mockTierFromPriceId.mockReturnValueOnce("pro");
    expect(subscriptionTier(subscription({ metadata: {}, items: { data: [{ price: { id: "price_pro" } }] } }), "business")).toBe("pro");
  });
});
