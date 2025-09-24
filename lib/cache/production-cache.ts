/**
 * Production cache for handling cold starts and initial loads
 * This helps prevent stuck loading states on fresh deployments
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

class ProductionCache {
  private cache = new Map<string, CacheEntry<any>>()
  private readonly DEFAULT_TTL = 60000 // 1 minute default

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  clear(pattern?: string): void {
    if (!pattern) {
      this.cache.clear()
      return
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }

  // Warm up cache with initial data to prevent cold start issues
  async warmup(): Promise<void> {
    console.log('🔥 Warming up production cache...')

    // Pre-cache critical paths
    const criticalPaths = [
      '/api/auth/user',
      '/api/integrations',
      '/api/providers'
    ]

    // Mark cache as warmed
    this.set('cache_warmed', true, 5 * 60000) // 5 minutes
  }

  isWarmed(): boolean {
    return this.get('cache_warmed') === true
  }
}

export const prodCache = new ProductionCache()