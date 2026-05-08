import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

export function isRedisConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function getRedis(): Redis {
  if (!_redis) {
    if (!isRedisConfigured()) {
      throw new Error("Upstash Redis env vars are not set");
    }

    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }

  return _redis;
}
