import { Redis } from '@upstash/redis'

/** Global key prefix for all Redis keys in this app */
export const REDIS_KEY_PREFIX = 'chainreact:'

/** Helper to build a prefixed Redis key */
export function redisKey(...parts: string[]): string {
  return REDIS_KEY_PREFIX + parts.join(':')
}

let redis: Redis | null = null

/**
 * Get the shared Upstash Redis client (lazy initialized).
 * Never call `new Redis()` directly — use this getter.
 */
export function getRedisClient(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
      throw new Error(
        'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables'
      )
    }

    redis = new Redis({ url, token })
  }

  return redis
}
