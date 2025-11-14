import { logger } from './logger'

/**
 * Request deduplication manager
 * Prevents multiple identical requests from firing simultaneously
 */
class RequestDeduplicationManager {
  private pendingRequests: Map<string, Promise<any>> = new Map()
  private requestTimestamps: Map<string, number> = new Map()

  // Clean up old requests every 5 minutes
  private cleanupInterval: NodeJS.Timeout | null = null
  private readonly STALE_REQUEST_TTL = 5 * 60 * 1000 // 5 minutes

  constructor() {
    if (typeof window !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000)
    }
  }

  /**
   * Execute a request with deduplication
   * If the same request is already pending, return the existing promise
   */
  async execute<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: {
      ttl?: number // How long to deduplicate for (default: 5 minutes)
    } = {}
  ): Promise<T> {
    const now = Date.now()
    const ttl = options.ttl || this.STALE_REQUEST_TTL

    // Check if there's a pending request for this key
    const existing = this.pendingRequests.get(key)
    const timestamp = this.requestTimestamps.get(key)

    if (existing && timestamp && (now - timestamp) < ttl) {
      logger.debug('🔄 [RequestDedup] Reusing pending request:', key)
      return existing
    }

    logger.debug('🚀 [RequestDedup] Starting new request:', key)

    // Create new request
    const promise = fetcher()
      .finally(() => {
        // Clean up after request completes
        this.pendingRequests.delete(key)
        // Keep timestamp for a bit to prevent rapid re-requests
        setTimeout(() => {
          this.requestTimestamps.delete(key)
        }, 1000)
      })

    this.pendingRequests.set(key, promise)
    this.requestTimestamps.set(key, now)

    return promise
  }

  /**
   * Check if a request is currently pending
   */
  isPending(key: string): boolean {
    return this.pendingRequests.has(key)
  }

  /**
   * Get pending request promise
   */
  getPending<T>(key: string): Promise<T> | undefined {
    return this.pendingRequests.get(key)
  }

  /**
   * Clear a specific request
   */
  clear(key: string): void {
    this.pendingRequests.delete(key)
    this.requestTimestamps.delete(key)
  }

  /**
   * Clear all pending requests
   */
  clearAll(): void {
    this.pendingRequests.clear()
    this.requestTimestamps.clear()
  }

  /**
   * Clean up stale requests
   */
  private cleanup(): void {
    const now = Date.now()
    const staleKeys: string[] = []

    this.requestTimestamps.forEach((timestamp, key) => {
      if (now - timestamp > this.STALE_REQUEST_TTL) {
        staleKeys.push(key)
      }
    })

    staleKeys.forEach(key => {
      this.pendingRequests.delete(key)
      this.requestTimestamps.delete(key)
    })

    if (staleKeys.length > 0) {
      logger.debug(`🧹 [RequestDedup] Cleaned up ${staleKeys.length} stale requests`)
    }
  }

  /**
   * Destroy the manager and clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.clearAll()
  }
}

// Export singleton instance
export const requestDeduplicationManager = new RequestDeduplicationManager()

/**
 * Utility function for deduplicating requests
 */
export const deduplicateRequest = <T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { ttl?: number }
): Promise<T> => {
  return requestDeduplicationManager.execute(key, fetcher, options)
}
