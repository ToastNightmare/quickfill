import { Ratelimit } from "@upstash/ratelimit";
import { getRedis, isRedisConfigured } from "@/lib/redis";

type RateLimitPolicy = "default" | "abn" | "detectFields" | "fillPdf" | "checkout" | "billingSync" | "portal" | "support" | "usage";

const policyWindows: Record<RateLimitPolicy, { requests: number; window: `${number} ${"s" | "m" | "h"}` }> = {
  default: { requests: 30, window: "60 s" },
  abn: { requests: 60, window: "60 s" },
  detectFields: { requests: 20, window: "60 s" },
  fillPdf: { requests: 20, window: "60 s" },
  checkout: { requests: 8, window: "60 s" },
  billingSync: { requests: 6, window: "60 s" },
  portal: { requests: 8, window: "60 s" },
  support: { requests: 5, window: "10 m" },
  usage: { requests: 20, window: "60 s" },
};

const limiters = new Map<RateLimitPolicy, Ratelimit>();

function getLimiter(policy: RateLimitPolicy) {
  const existing = limiters.get(policy);
  if (existing) return existing;

  const config = policyWindows[policy];
  const limiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(config.requests, config.window),
    analytics: true,
  });
  limiters.set(policy, limiter);
  return limiter;
}

export async function checkRateLimit(identifier: string, policy: RateLimitPolicy = "default") {
  if (!isRedisConfigured()) {
    return { success: true, remaining: Number.POSITIVE_INFINITY, limit: Number.POSITIVE_INFINITY, reset: Date.now() + 60000 };
  }

  return getLimiter(policy).limit(`${policy}:${identifier}`);
}
