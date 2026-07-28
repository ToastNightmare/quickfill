import { Ratelimit } from "@upstash/ratelimit";
import { checkRateLimit } from "../rate-limit";

jest.mock("@upstash/ratelimit", () => {
  const Ratelimit = jest.fn(() => ({
    limit: jest.fn().mockResolvedValue({ success: true }),
  }));
  Object.assign(Ratelimit, {
    slidingWindow: jest.fn(() => "sliding-window"),
  });
  return { Ratelimit };
});

jest.mock("../redis", () => ({
  getRedis: jest.fn(() => ({})),
  isRedisConfigured: jest.fn(() => true),
}));

describe("rate-limit policies", () => {
  it("configures admin login attempts at 5 requests per 10 minutes", async () => {
    await checkRateLimit("admin-user", "adminLogin");

    expect(Ratelimit.slidingWindow).toHaveBeenCalledWith(5, "10 m");
  });
});
