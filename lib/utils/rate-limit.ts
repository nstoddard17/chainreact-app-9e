/**
 * Rate Limiting Utility
 *
 * Simple in-memory rate limiter for API routes.
 * For production, consider using Redis-based rate limiting.
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from './logger'

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory store for rate limiting
// Note: This resets on server restart. For production, use Redis.
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // Clean up every minute

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
  // Try to get real IP from various headers
  const forwardedFor = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  const cfConnectingIp = req.headers.get('cf-connecting-ip')

  const ip = cfConnectingIp || realIp || forwardedFor?.split(',')[0]?.trim() || 'unknown'

  return ip
}

/**
 * Check rate limit for a request
 */
export function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig
): RateLimitResult {
  const { limit, windowSeconds, keyGenerator, onRateLimited } = config

  const key = keyGenerator ? keyGenerator(req) : getClientKey(req)
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  let entry = rateLimitStore.get(key)

  // Create new entry if none exists or window has expired
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 0,
      resetTime: now + windowMs
    }
  }

  entry.count++
  rateLimitStore.set(key, entry)

  const remaining = Math.max(0, limit - entry.count)
  const resetIn = Math.ceil((entry.resetTime - now) / 1000)

  if (entry.count > limit) {
    logger.warn('[Rate Limit] Request blocked', {
      key: key.substring(0, 10) + '...',
      count: entry.count,
      limit
    })

    const response = onRateLimited?.() || NextResponse.json(
      {
        error: 'Too many requests',
        retryAfter: resetIn
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(resetIn),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(entry.resetTime / 1000))
        }
      }
    )

    return { success: false, remaining: 0, resetIn, response }
  }

  return { success: true, remaining, resetIn }
}

/**
 * Rate limit middleware wrapper for API routes
 */
export function withRateLimit(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>,
  config: RateLimitConfig
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    const result = checkRateLimit(req, config)

    if (!result.success && result.response) {
      return result.response
    }

    const response = await handler(req, context)

    // Add rate limit headers to successful responses
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
