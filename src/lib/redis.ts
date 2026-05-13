import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
let checkingAuthoritativeTier = false;

export function isRedisConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function patchSubscriptionCacheReads(redis: Redis) {
  const rawGet = redis.get.bind(redis) as (...args: any[]) => Promise<unknown>;

  (redis as any).get = async (...args: any[]) => {
    const key = args[0];
    if (typeof key !== "string" || !key.startsWith("sub:") || checkingAuthoritativeTier) {
      return rawGet(...args);
    }

    const userId = key.slice("sub:".length);
    if (!userId) return rawGet(...args);

    checkingAuthoritativeTier = true;
    try {
      const { getStoredTier } = await import("@/lib/billing-store");
      const tier = await getStoredTier(userId);
      return tier === "pro" || tier === "business" ? tier : null;
    } finally {
      checkingAuthoritativeTier = false;
    }
  };

  return redis;
}

export function getRedis(): Redis {
  if (!_redis) {
    if (!isRedisConfigured()) {
      throw new Error("Upstash Redis env vars are not set");
    }

    _redis = patchSubscriptionCacheReads(new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    }));
  }

  return _redis;
}
