/**
 * LLM Planning Result Cache
 *
 * Caches LLM planning results by prompt + connected integrations hash.
 * Identical prompts from the same user with the same integrations will
 * return cached results instead of making fresh LLM calls.
 *
 * TTL: 5 minutes (plans are ephemeral, integrations may change)
 * Max entries: 100 (prevent unbounded memory growth)
 */

import { createHash } from 'crypto'
import { logger } from '@/lib/utils/logger'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_CACHE_ENTRIES = 100

interface CacheEntry<T> {
  data: T
  createdAt: number
}

const cache = new Map<string, CacheEntry<any>>()

/**
 * Generate a cache key from prompt and connected integrations.
 */
function makeCacheKey(prompt: string, connectedIntegrations: string[]): string {
  const normalized = [
    prompt.trim().toLowerCase(),
    ...connectedIntegrations.map(i => i.toLowerCase()).sort()
  ].join('|')

  return createHash('sha256').update(normalized).digest('hex').substring(0, 16)
}

/**
 * Get a cached planning result if available and not expired.
 */
export function getCachedPlan<T>(
  prompt: string,
  connectedIntegrations: string[]
): T | null {
  const key = makeCacheKey(prompt, connectedIntegrations)
  const entry = cache.get(key)

  if (!entry) return null

  const age = Date.now() - entry.createdAt
  if (age > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }

  logger.info('[PlanCache] Cache hit', {
    key,
    ageMs: age,
    promptPreview: prompt.substring(0, 50),
  })

  return entry.data as T
}

/**
 * Store a planning result in the cache.
 */
export function cachePlan<T>(
  prompt: string,
  connectedIntegrations: string[],
  data: T
): void {
  // Evict expired entries and trim to max size
  if (cache.size >= MAX_CACHE_ENTRIES) {
    evictStale()
  }

  // If still at max after eviction, remove oldest entry
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }

  const key = makeCacheKey(prompt, connectedIntegrations)
  cache.set(key, { data, createdAt: Date.now() })

  logger.debug('[PlanCache] Cached plan', {
    key,
    cacheSize: cache.size,
    promptPreview: prompt.substring(0, 50),
  })
}

/**
 * Remove all expired entries from the cache.
 */
function evictStale(): void {
  const now = Date.now()
  let evicted = 0

  for (const [key, entry] of cache.entries()) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      cache.delete(key)
      evicted++
    }
  }

  if (evicted > 0) {
    logger.debug('[PlanCache] Evicted stale entries', { evicted, remaining: cache.size })
  }
}

/**
 * Clear the entire cache (for testing purposes).
 */
export function clearPlanCache(): void {
  cache.clear()
}
