/**
 * Request Deduplication Utility
 *
 * Prevents multiple simultaneous identical API requests by caching promises
 * and returning the same promise for duplicate requests while the first is pending.
 *
 * This is particularly useful for:
 * - React components that might mount multiple times (Strict Mode)
 * - Multiple components requesting the same data simultaneously
 * - Rapid navigation causing overlapping requests
 */

interface PendingRequest<T> {
  promise: Promise<T>
  timestamp: number
}

class RequestDeduplicator {
  private pendingRequests: Map<string, PendingRequest<any>> = new Map()
  private readonly CACHE_DURATION = 100 // ms - how long to consider a request "in-flight"

  /**
   * Deduplicate a request by its key
   * If a request with the same key is already pending, return that promise
   * Otherwise, execute the request function and cache the promise
   */
  async deduplicate<T>(
    key: string,
    requestFn: () => Promise<T>,
    options?: {
      /** Custom cache duration in ms (default: 100ms) */
      cacheDuration?: number
      /** Force refresh - ignore pending requests */
      force?: boolean
    }
  ): Promise<T> {
    const cacheDuration = options?.cacheDuration ?? this.CACHE_DURATION
    const now = Date.now()

    // Check if there's a pending request for this key
    const pending = this.pendingRequests.get(key)

    if (!options?.force && pending && (now - pending.timestamp) < cacheDuration) {
      console.log(`[RequestDedup] Using cached promise for: ${key}`)
      return pending.promise
    }

    // Execute new request
    console.log(`[RequestDedup] Executing new request for: ${key}`)
    const promise = requestFn()
      .finally(() => {
        // Clean up after request completes
        setTimeout(() => {
          this.pendingRequests.delete(key)
        }, cacheDuration)
      })

    // Cache the promise
    this.pendingRequests.set(key, {
      promise,
      timestamp: now
    })

    return promise
  }

  /**
   * Clear a specific request from the cache
   */
  clear(key: string) {
    this.pendingRequests.delete(key)
  }

  /**
   * Clear all cached requests
   */
  clearAll() {
    this.pendingRequests.clear()
  }

  /**
   * Get current pending request count
   */
  getPendingCount(): number {
    return this.pendingRequests.size
  }
}

// Global singleton instance
export const requestDeduplicator = new RequestDeduplicator()

/**
 * Higher-order function to wrap any async function with request deduplication
 *
 * @example
 * const fetchUserData = withRequestDeduplication(
 *   (userId: string) => fetch(`/api/users/${userId}`).then(r => r.json()),
 *   (userId) => `user-${userId}` // Key function
 * )
 *
 * // These will only make ONE request if called simultaneously
 * Promise.all([
 *   fetchUserData('123'),
 *   fetchUserData('123'),
 *   fetchUserData('123')
 * ])
 */
export function withRequestDeduplication<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  keyFn: (...args: TArgs) => string
) {
  return async (...args: TArgs): Promise<TResult> => {
    const key = keyFn(...args)
    return requestDeduplicator.deduplicate(key, () => fn(...args))
  }
}
