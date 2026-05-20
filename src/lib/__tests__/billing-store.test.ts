import { getRedis, isRedisConfigured } from "../redis";
import { isDatabaseConfigured, query } from "../db";
import {
  getStoredSubscriptionSnapshot,
  getStoredTier,
  isSubscriptionEntitled,
  saveSubscriptionSnapshot,
  stripeSubscriptionPeriodEnd,
} from "../billing-store";

jest.mock("../redis", () => ({
  getRedis: jest.fn(),
  isRedisConfigured: jest.fn(),
}));

jest.mock("../db", () => ({
  isDatabaseConfigured: jest.fn(),
  query: jest.fn(),
}));

const mockGetRedis = jest.mocked(getRedis);
const mockIsRedisConfigured = jest.mocked(isRedisConfigured);
const mockIsDatabaseConfigured = jest.mocked(isDatabaseConfigured);
const mockQuery = jest.mocked(query);

const redis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

describe("billing entitlements", () => {
  const realDateNow = Date.now;

  beforeEach(() => {
    jest.clearAllMocks();
    Date.now = jest.fn(() => new Date("2026-05-13T00:00:00.000Z").getTime());
    mockGetRedis.mockReturnValue(redis as never);
    mockIsRedisConfigured.mockReturnValue(true);
    mockIsDatabaseConfigured.mockReturnValue(true);
  });

  afterAll(() => {
    Date.now = realDateNow;
  });

  it("does not grant paid access for past-due or unpaid subscriptions", () => {
    expect(isSubscriptionEntitled("past_due", Math.floor(Date.now() / 1000) + 3600)).toBe(false);
    expect(isSubscriptionEntitled("unpaid", Math.floor(Date.now() / 1000) + 3600)).toBe(false);
    expect(isSubscriptionEntitled("canceled", Math.floor(Date.now() / 1000) + 3600)).toBe(false);
  });

  it("keeps active subscriptions entitled when Stripe omits the billing period", () => {
    expect(isSubscriptionEntitled("active", null)).toBe(true);
    expect(isSubscriptionEntitled("active", "2026-05-12T00:00:00.000Z")).toBe(false);
  });

  it("keeps paid access for current active subscriptions", () => {
    expect(isSubscriptionEntitled("active", "2026-06-12T00:00:00.000Z")).toBe(true);
    expect(isSubscriptionEntitled("trialing", "2026-06-12T00:00:00.000Z")).toBe(true);
  });

  it("reads Stripe period end from subscription items when needed", () => {
    const periodEnd = Math.floor(new Date("2026-06-12T00:00:00.000Z").getTime() / 1000);
    const subscription = {
      items: { data: [{ current_period_end: periodEnd }] },
    };

    expect(stripeSubscriptionPeriodEnd(subscription as never)).toBe(periodEnd);
  });

  it("returns free for stale database subscriptions without falling back to old Redis Pro cache", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        tier: "pro",
        status: "active",
        current_period_end: new Date("2026-05-12T00:00:00.000Z"),
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        updated_at: new Date("2026-05-12T00:00:00.000Z"),
      },
    ] as never);
    redis.get.mockResolvedValue("pro");

    await expect(getStoredTier("user_123")).resolves.toBe("free");

    expect(redis.get).not.toHaveBeenCalledWith("sub:user_123");
  });

  it("returns free when the database has no subscription row even if Redis has stale Pro cache", async () => {
    mockQuery.mockResolvedValueOnce([] as never);
    redis.get.mockResolvedValue("pro");

    await expect(getStoredTier("user_123")).resolves.toBe("free");

    expect(redis.get).not.toHaveBeenCalledWith("sub:user_123");
    expect(redis.del).toHaveBeenCalledWith("sub:user_123");
  });

  it("falls back to cached paid access when the database lookup fails", async () => {
    mockQuery.mockRejectedValueOnce(new Error("database offline"));
    redis.get.mockResolvedValueOnce("pro").mockResolvedValueOnce("cus_123");

    await expect(getStoredSubscriptionSnapshot("user_123")).resolves.toMatchObject({
      tier: "pro",
      status: "redis_cache",
      stripeCustomerId: "cus_123",
      entitled: true,
      needsReview: true,
      reviewReason: "Database subscription lookup failed; using cached active entitlement. Check Ops health and run Billing Repair.",
    });
  });

  it("uses cached paid access for tier lookup when the database lookup fails", async () => {
    mockQuery.mockRejectedValueOnce(new Error("database offline"));
    redis.get.mockResolvedValueOnce("pro").mockResolvedValueOnce("cus_123");

    await expect(getStoredTier("user_123")).resolves.toBe("pro");
  });

  it("flags active stored subscriptions with missing billing periods for admin review", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        tier: "pro",
        status: "active",
        current_period_end: null,
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        updated_at: new Date("2026-05-12T00:00:00.000Z"),
      },
    ] as never);

    await expect(getStoredSubscriptionSnapshot("user_123")).resolves.toMatchObject({
      tier: "pro",
      status: "active",
      entitled: true,
      needsReview: true,
      reviewReason: "Stripe did not provide a renewal/end date; access is allowed while Stripe status is active.",
    });
  });

  it("clears Redis paid cache when saving a past-due subscription snapshot", async () => {
    mockQuery.mockResolvedValueOnce([] as never);

    await saveSubscriptionSnapshot({
      userId: "user_123",
      customerId: "cus_123",
      subscriptionId: "sub_123",
      tier: "pro",
      status: "past_due",
      currentPeriodEnd: Math.floor(new Date("2026-05-12T00:00:00.000Z").getTime() / 1000),
    });

    expect(redis.del).toHaveBeenCalledWith("sub:user_123");
    expect(redis.set).toHaveBeenCalledWith("stripe_customer:user_123", "cus_123");
    expect(redis.set).toHaveBeenCalledWith("stripe_customer_user:cus_123", "user_123");
  });
});
