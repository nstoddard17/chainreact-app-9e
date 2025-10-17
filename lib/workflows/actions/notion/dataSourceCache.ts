import { logger } from '@/lib/utils/logger'

/**
 * Simple in-memory cache for Notion database to data source mappings
 * This prevents redundant API calls to fetch data source IDs
 *
 * Cache expires after 1 hour to ensure we get updated mappings if they change
 */

interface CacheEntry {
  dataSourceId: string
  timestamp: number
}

// In-memory cache with database ID as key
const cache = new Map<string, CacheEntry>()

// Cache TTL: 1 hour
const CACHE_TTL = 60 * 60 * 1000

/**
 * Get cached data source ID for a database
 * Returns undefined if not in cache or expired
 */
export function getCachedDataSourceId(databaseId: string): string | undefined {
  const entry = cache.get(databaseId)

  if (!entry) {
    return undefined
  }

  // Check if entry is expired
  const now = Date.now()
  if (now - entry.timestamp > CACHE_TTL) {
    cache.delete(databaseId)
    logger.debug('Data source cache entry expired')
    return undefined
  }

  return entry.dataSourceId
}

/**
 * Store data source ID in cache
 */
export function cacheDataSourceId(databaseId: string, dataSourceId: string): void {
  cache.set(databaseId, {
    dataSourceId,
    timestamp: Date.now()
  })

  logger.debug('Cached data source mapping')
}

/**
 * Clear cache entry for a specific database
 */
export function clearCacheEntry(databaseId: string): void {
  cache.delete(databaseId)
}

/**
 * Clear entire cache (useful for testing or manual refresh)
 */
export function clearCache(): void {
  cache.clear()
  logger.debug('Cleared data source cache')
}

/**
 * Get cache statistics (for monitoring)
 */
export function getCacheStats() {
  return {
    size: cache.size,
    entries: Array.from(cache.keys())
  }
}
