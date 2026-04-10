/**
 * Rate Limiting Utility
 *
 * Uses Upstash Redis for persistent, cross-instance rate limiting.
 * Falls back to in-memory if Redis is not configured.
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from './logger'

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory fallback store
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries periodically (only used for in-memory fallback)
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 60000)

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number
  /** Time window in seconds */
  windowSeconds: number
  /** Custom key generator (default: IP address) */
  keyGenerator?: (req: NextRequest) => string
  /** Custom response when rate limited */
  onRateLimited?: () => NextResponse
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetIn: number
  response?: NextResponse
}

/**
 * Get client identifier for rate limiting
 */
function getClientKey(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  const cfConnectingIp = req.headers.get('cf-connecting-ip')

  const ip = cfConnectingIp || realIp || forwardedFor?.split(',')[0]?.trim() || 'unknown'

  return ip
}

/**
 * Try Redis-based rate limit check. Returns null if Redis is unavailable.
 */
async function checkRateLimitRedis(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult | null> {
  try {
    const { getRedisClient, redisKey: rk } = await import('@/lib/redis/client')
    const redis = getRedisClient()

    const redisKey = rk('rate_limit', key)
    const now = Date.now()

    // Use Redis pipeline: increment counter and set expiry atomically
    const pipeline = redis.pipeline()
    pipeline.incr(redisKey)
    pipeline.ttl(redisKey)
    const results = await pipeline.exec()

    const count = results[0] as number
    const ttl = results[1] as number

    // Set expiry on first request in window (when count is 1 or key had no TTL)
    if (count === 1 || ttl === -1) {
      await redis.expire(redisKey, windowSeconds)
    }

    const resetIn = ttl > 0 ? ttl : windowSeconds

    if (count > limit) {
      logger.warn('[Rate Limit] Redis: request blocked', {
        key: key.substring(0, 10) + '...',
        count,
        limit,
      })

      return {
        success: false,
        remaining: 0,
        resetIn,
        response: NextResponse.json(
          { error: 'Too many requests', retryAfter: resetIn },
          {
            status: 429,
            headers: {
              'Retry-After': String(resetIn),
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.ceil((now + resetIn * 1000) / 1000)),
            },
          }
        ),
      }
    }

    return {
      success: true,
      remaining: Math.max(0, limit - count),
      resetIn,
    }
  } catch {
    // Redis unavailable — fall through to in-memory
    return null
  }
}

/**
 * In-memory rate limit check (fallback)
 */
function checkRateLimitMemory(
  key: string,
  limit: number,
  windowSeconds: number
): RateLimitResult {
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  let entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + windowMs }
  }

  entry.count++
  rateLimitStore.set(key, entry)

  const remaining = Math.max(0, limit - entry.count)
  const resetIn = Math.ceil((entry.resetTime - now) / 1000)

  if (entry.count > limit) {
    logger.warn('[Rate Limit] Memory: request blocked', {
      key: key.substring(0, 10) + '...',
      count: entry.count,
      limit,
    })

    return {
      success: false,
      remaining: 0,
      resetIn,
      response: NextResponse.json(
        { error: 'Too many requests', retryAfter: resetIn },
        {
          status: 429,
          headers: {
            'Retry-After': String(resetIn),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(entry.resetTime / 1000)),
          },
        }
      ),
    }
  }

  return { success: true, remaining, resetIn }
}

/**
 * Check rate limit for a request.
 * Uses Redis when available, falls back to in-memory.
 */
export async function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { limit, windowSeconds, keyGenerator } = config
  const key = keyGenerator ? keyGenerator(req) : getClientKey(req)

  // Try Redis first
  const redisResult = await checkRateLimitRedis(key, limit, windowSeconds)
  if (redisResult) return redisResult

  // Fall back to in-memory
  return checkRateLimitMemory(key, limit, windowSeconds)
}

/**
 * Rate limit middleware wrapper for API routes
 */
export function withRateLimit(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>,
  config: RateLimitConfig
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    const result = await checkRateLimit(req, config)

    if (!result.success && result.response) {
      return result.response
    }

    const response = await handler(req, context)

    response.headers.set('X-RateLimit-Limit', String(config.limit))
    response.headers.set('X-RateLimit-Remaining', String(result.remaining))

    return response
  }
}

/**
 * Preset rate limit configurations
 */
export const RateLimitPresets = {
  /** Strict: 10 requests per minute (for sensitive endpoints) */
  strict: { limit: 10, windowSeconds: 60 },

  /** Standard: 60 requests per minute (for normal API endpoints) */
  standard: { limit: 60, windowSeconds: 60 },

  /** Relaxed: 200 requests per minute (for high-frequency endpoints) */
  relaxed: { limit: 200, windowSeconds: 60 },

  /** Auth: 5 requests per minute (for auth endpoints) */
  auth: { limit: 5, windowSeconds: 60 },

  /** Webhook: 100 requests per minute per workflow */
  webhook: { limit: 100, windowSeconds: 60 },
}
