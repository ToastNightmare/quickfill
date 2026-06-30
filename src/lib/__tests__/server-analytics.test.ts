import { getRedis } from "../redis";
import { PRICING } from "../pricing";
import { trackServerEvent } from "../server-analytics";

jest.mock("../redis", () => ({
  getRedis: jest.fn(),
}));

const mockGetRedis = jest.mocked(getRedis);

function createPipeline() {
  return {
    hincrby: jest.fn(),
    expire: jest.fn(),
    lpush: jest.fn(),
    ltrim: jest.fn(),
    exec: jest.fn().mockResolvedValue([]),
  };
}

describe("trackServerEvent revenue estimates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-17T03:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("tracks monthly intro first-period revenue separately from monthly run-rate", async () => {
    const pipeline = createPipeline();
    mockGetRedis.mockReturnValue({ pipeline: jest.fn(() => pipeline) } as never);

    await trackServerEvent("subscription_started", { billing: "monthly" });

    const dailyRevenueKey = "analytics:revenue:2026-06-17";
    const totalRevenueKey = "analytics:revenue:total";
    const monthlyFirstPeriodCents = Math.round(PRICING.pro.monthly.conversionValue * 100);
    const monthlyRunRateCents = Math.round(PRICING.pro.monthly.amount * 100);

    expect(monthlyFirstPeriodCents).toBe(200);
    expect(monthlyRunRateCents).toBe(2500);
    expect(pipeline.hincrby).toHaveBeenCalledWith(dailyRevenueKey, "first_period_cents", 200);
    expect(pipeline.hincrby).toHaveBeenCalledWith(dailyRevenueKey, "monthly_run_rate_cents", 2500);
    expect(pipeline.hincrby).toHaveBeenCalledWith(totalRevenueKey, "first_period_cents", 200);
    expect(pipeline.hincrby).toHaveBeenCalledWith(totalRevenueKey, "monthly_run_rate_cents", 2500);
  });

  it("tracks annual first-period revenue and rounded monthly run-rate", async () => {
    const pipeline = createPipeline();
    mockGetRedis.mockReturnValue({ pipeline: jest.fn(() => pipeline) } as never);

    await trackServerEvent("subscription_started", { billing: "annual" });

    const dailyRevenueKey = "analytics:revenue:2026-06-17";
    const totalRevenueKey = "analytics:revenue:total";
    const annualFirstPeriodCents = Math.round(PRICING.pro.annual.amount * 100);
    const annualMonthlyRunRateCents = Math.round(annualFirstPeriodCents / 12);

    expect(annualFirstPeriodCents).toBe(14900);
    expect(annualMonthlyRunRateCents).toBe(1242);
    expect(pipeline.hincrby).toHaveBeenCalledWith(dailyRevenueKey, "first_period_cents", 14900);
    expect(pipeline.hincrby).toHaveBeenCalledWith(dailyRevenueKey, "monthly_run_rate_cents", 1242);
    expect(pipeline.hincrby).toHaveBeenCalledWith(totalRevenueKey, "first_period_cents", 14900);
    expect(pipeline.hincrby).toHaveBeenCalledWith(totalRevenueKey, "monthly_run_rate_cents", 1242);
  });
});
