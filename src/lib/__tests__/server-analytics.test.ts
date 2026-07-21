import { getRedis } from "../redis";
import { log } from "../log";
import { PRICING } from "../pricing";
import { trackServerEvent } from "../server-analytics";

jest.mock("../redis", () => ({
  getRedis: jest.fn(),
}));

jest.mock("../log", () => ({
  log: {
    warn: jest.fn(),
  },
}));

const mockGetRedis = jest.mocked(getRedis);
const mockWarn = jest.mocked(log.warn);
const BASE_RESULT_COUNT = 5;
const SUBSCRIPTION_RESULT_COUNT = 16;
const ANALYTICS_TIMEOUT_MS = 1_000;

type MockPipelineResult = { result: unknown; error?: unknown };

function successfulResults(count: number): MockPipelineResult[] {
  return Array.from({ length: count }, () => ({ result: 1, error: undefined }));
}

function createPipeline(resultCount = BASE_RESULT_COUNT) {
  return {
    hincrby: jest.fn(),
    expire: jest.fn(),
    lpush: jest.fn(),
    ltrim: jest.fn(),
    exec: jest.fn().mockResolvedValue(successfulResults(resultCount)),
  };
}

function usePipeline(pipeline: ReturnType<typeof createPipeline>) {
  const pipelineFactory = jest.fn(() => pipeline);
  mockGetRedis.mockReturnValue({ pipeline: pipelineFactory } as never);
  return pipelineFactory;
}

function expectSanitizedWarning(phase: string, canary?: string) {
  expect(mockWarn.mock.calls).toEqual([["server_analytics_failed", { phase }]]);
  if (canary) expect(JSON.stringify(mockWarn.mock.calls)).not.toContain(canary);
}

function createMaliciousError(canary: string) {
  const error = new Error(canary);
  Object.defineProperties(error, {
    name: { configurable: true, get: () => canary },
    message: { configurable: true, get: () => canary },
    stack: { configurable: true, get: () => canary },
    credentials: { configurable: true, value: canary },
  });
  return error;
}

describe("trackServerEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-17T03:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("writes the exact base counters, recent event, retention, and cleanup commands", async () => {
    const pipeline = createPipeline();
    usePipeline(pipeline);

    await expect(
      trackServerEvent("checkout_start", { source: "checkout", plan: "pro", billing: "monthly" }),
    ).resolves.toBe(true);

    expect(pipeline.hincrby.mock.calls).toEqual([
      ["analytics:2026-06-17", "checkout_start", 1],
      ["analytics:total", "checkout_start", 1],
    ]);
    expect(pipeline.expire.mock.calls).toEqual([["analytics:2026-06-17", 60 * 60 * 24 * 120]]);
    expect(pipeline.lpush.mock.calls).toEqual([
      [
        "analytics:recent",
        {
          name: "checkout_start",
          properties: { source: "checkout", plan: "pro", billing: "monthly" },
          signedIn: true,
          createdAt: "2026-06-17T03:00:00.000Z",
        },
      ],
    ]);
    expect(pipeline.ltrim.mock.calls).toEqual([["analytics:recent", 0, 499]]);
    expect(pipeline.exec).toHaveBeenCalledWith({ keepErrors: true });
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("writes all monthly subscription counters and revenue totals exactly", async () => {
    const pipeline = createPipeline(SUBSCRIPTION_RESULT_COUNT);
    usePipeline(pipeline);

    await expect(trackServerEvent("subscription_started", { billing: "monthly" })).resolves.toBe(true);

    const dailyRevenueKey = "analytics:revenue:2026-06-17";
    const totalRevenueKey = "analytics:revenue:total";
    const monthlyFirstPeriodCents = Math.round(PRICING.pro.monthly.conversionValue * 100);
    const monthlyRunRateCents = Math.round(PRICING.pro.monthly.amount * 100);

    expect(monthlyFirstPeriodCents).toBe(200);
    expect(monthlyRunRateCents).toBe(2500);
    expect(pipeline.hincrby.mock.calls).toEqual([
      ["analytics:2026-06-17", "subscription_started", 1],
      ["analytics:total", "subscription_started", 1],
      [dailyRevenueKey, "paid_conversions", 1],
      [dailyRevenueKey, "annual_starts", 0],
      [dailyRevenueKey, "monthly_starts", 1],
      [dailyRevenueKey, "first_period_cents", 200],
      [dailyRevenueKey, "monthly_run_rate_cents", 2500],
      [totalRevenueKey, "paid_conversions", 1],
      [totalRevenueKey, "annual_starts", 0],
      [totalRevenueKey, "monthly_starts", 1],
      [totalRevenueKey, "first_period_cents", 200],
      [totalRevenueKey, "monthly_run_rate_cents", 2500],
    ]);
    expect(pipeline.expire.mock.calls).toEqual([
      ["analytics:2026-06-17", 60 * 60 * 24 * 120],
      [dailyRevenueKey, 60 * 60 * 24 * 120],
    ]);
    expect(pipeline.ltrim.mock.calls).toEqual([["analytics:recent", 0, 499]]);
    expect(pipeline.exec).toHaveBeenCalledWith({ keepErrors: true });
  });

  it("tracks annual first-period revenue and rounded monthly run-rate", async () => {
    const pipeline = createPipeline(SUBSCRIPTION_RESULT_COUNT);
    usePipeline(pipeline);

    await expect(trackServerEvent("subscription_started", { billing: "annual" })).resolves.toBe(true);

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

  it("returns false silently for unsupported events", async () => {
    await expect(trackServerEvent("unsupported_event" as never, { secret: "not-read" })).resolves.toBe(false);

    expect(mockGetRedis).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("fails open when property sanitization throws", async () => {
    const canary = "SANITIZE_SECRET_CANARY";
    const properties = new Proxy({}, {
      ownKeys: () => {
        throw createMaliciousError(canary);
      },
    });

    await expect(trackServerEvent("checkout_start", properties)).resolves.toBe(false);

    expect(mockGetRedis).not.toHaveBeenCalled();
    expectSanitizedWarning("pipeline_build", canary);
  });

  it("fails open when Redis setup throws a malicious Error", async () => {
    const canary = "REDIS_ERROR_SECRET_CANARY";
    mockGetRedis.mockImplementation(() => {
      throw createMaliciousError(canary);
    });

    await expect(trackServerEvent("checkout_start")).resolves.toBe(false);

    expectSanitizedWarning("redis_setup", canary);
  });

  it("fails open when pipeline construction throws", async () => {
    const pipelineFactory = jest.fn(() => {
      throw new Error("pipeline constructor failed");
    });
    mockGetRedis.mockReturnValue({ pipeline: pipelineFactory } as never);

    await expect(trackServerEvent("checkout_start")).resolves.toBe(false);

    expectSanitizedWarning("pipeline_build");
  });

  it("fails open when queuing a pipeline command throws", async () => {
    const canary = "QUEUED_COMMAND_SECRET_CANARY";
    const pipeline = createPipeline();
    pipeline.lpush.mockImplementation(() => {
      throw { payload: canary, id: canary, toString: () => canary };
    });
    usePipeline(pipeline);

    await expect(trackServerEvent("checkout_start")).resolves.toBe(false);

    expect(pipeline.exec).not.toHaveBeenCalled();
    expectSanitizedWarning("pipeline_build", canary);
  });

  it("fails open when exec throws synchronously", async () => {
    const pipeline = createPipeline();
    pipeline.exec.mockImplementation(() => {
      throw new Error("sync exec failure");
    });
    usePipeline(pipeline);

    await expect(trackServerEvent("checkout_start")).resolves.toBe(false);

    expectSanitizedWarning("pipeline_exec");
  });

  it("fails open when exec rejects with a malicious non-Error value", async () => {
    const canary = "ASYNC_NON_ERROR_SECRET_CANARY";
    const pipeline = createPipeline();
    pipeline.exec.mockRejectedValue({
      credentials: canary,
      payload: { id: canary },
      constructor: { name: canary },
      toString: () => canary,
    });
    usePipeline(pipeline);

    await expect(trackServerEvent("checkout_start")).resolves.toBe(false);

    expectSanitizedWarning("pipeline_exec", canary);
  });

  it("times out a hanging exec and safely consumes its late rejection", async () => {
    const canary = "LATE_REJECTION_SECRET_CANARY";
    let rejectExec!: (reason: unknown) => void;
    const hangingExec = new Promise<MockPipelineResult[]>((_resolve, reject) => {
      rejectExec = reject;
    });
    const pipeline = createPipeline();
    pipeline.exec.mockReturnValue(hangingExec);
    usePipeline(pipeline);

    const resultPromise = trackServerEvent("checkout_start");
    await jest.advanceTimersByTimeAsync(ANALYTICS_TIMEOUT_MS - 1);
    expect(mockWarn).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toBe(false);
    expectSanitizedWarning("timeout", canary);

    rejectExec(createMaliciousError(canary));
    await Promise.resolve();
    await Promise.resolve();
    expectSanitizedWarning("timeout", canary);
  });

  it("fails open on a resolved command-level error result", async () => {
    const canary = "PIPELINE_RESULT_SECRET_CANARY";
    const results = successfulResults(BASE_RESULT_COUNT);
    results[2] = { result: null, error: canary };
    const pipeline = createPipeline();
    pipeline.exec.mockResolvedValue(results);
    usePipeline(pipeline);

    await expect(trackServerEvent("checkout_start")).resolves.toBe(false);

    expectSanitizedWarning("result_invalid", canary);
  });

  it("fails open when resolved pipeline-result interpretation throws", async () => {
    const canary = "RESULT_PROXY_SECRET_CANARY";
    const results = new Proxy(successfulResults(BASE_RESULT_COUNT), {
      get: (target, property, receiver) => {
        if (property === "length") throw createMaliciousError(canary);
        return Reflect.get(target, property, receiver);
      },
    });
    const pipeline = createPipeline();
    pipeline.exec.mockResolvedValue(results);
    usePipeline(pipeline);

    await expect(trackServerEvent("checkout_start")).resolves.toBe(false);

    expectSanitizedWarning("result_invalid", canary);
  });

  it("keeps warning emission failures inside the analytics boundary", async () => {
    mockGetRedis.mockImplementation(() => {
      throw new Error("redis unavailable");
    });
    mockWarn.mockImplementation(() => {
      throw new Error("logger unavailable");
    });

    await expect(trackServerEvent("checkout_start")).resolves.toBe(false);

    expect(mockWarn.mock.calls).toEqual([["server_analytics_failed", { phase: "redis_setup" }]]);
  });
});
