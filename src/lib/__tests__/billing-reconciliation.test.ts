import { isDatabaseConfigured, query } from "../db";
import { getStripe } from "../stripe";
import { isSubscriptionEntitled, saveSubscriptionSnapshot, stripeSubscriptionPeriodEnd, tierFromPriceId } from "../billing-store";
import { reconcileStripeBilling, reconcileStripeBillingForUser, subscriptionTier } from "../billing-reconciliation";

jest.mock("../db", () => ({
  isDatabaseConfigured: jest.fn(),
  query: jest.fn(),
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
const mockQuery = jest.mocked(query);
const mockGetStripe = jest.mocked(getStripe);
const mockIsSubscriptionEntitled = jest.mocked(isSubscriptionEntitled);
const mockSaveSubscriptionSnapshot = jest.mocked(saveSubscriptionSnapshot);
const mockStripeSubscriptionPeriodEnd = jest.mocked(stripeSubscriptionPeriodEnd);
const mockTierFromPriceId = jest.mocked(tierFromPriceId);

const stripe = {
  customers: {
    list: jest.fn(),
  },
  subscriptions: {
    retrieve: jest.fn(),
    list: jest.fn(),
  },
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
    mockGetStripe.mockReturnValue(stripe as never);
    mockTierFromPriceId.mockReturnValue("pro");
    mockIsSubscriptionEntitled.mockReturnValue(true);
    mockStripeSubscriptionPeriodEnd.mockReturnValue(1770768000);
    stripe.customers.list.mockResolvedValue({ data: [] });
    stripe.subscriptions.list.mockResolvedValue({ data: [] });
  });

  afterAll(() => {
    process.env.STRIPE_SECRET_KEY = originalStripeSecret;
  });

  it("does not run when the database is unavailable", async () => {
    mockIsDatabaseConfigured.mockReturnValue(false);

    await expect(reconcileStripeBilling()).resolves.toMatchObject({
      ok: false,
      checked: 0,
      message: "DATABASE_URL is not configured; billing reconciliation cannot run.",
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

  it("uses metadata plan before falling back to price ids", () => {
    expect(subscriptionTier(subscription({ metadata: { plan: "business" } }), "pro")).toBe("business");

    mockTierFromPriceId.mockReturnValueOnce("pro");
    expect(subscriptionTier(subscription({ metadata: {}, items: { data: [{ price: { id: "price_pro" } }] } }), "business")).toBe("pro");
  });
});
