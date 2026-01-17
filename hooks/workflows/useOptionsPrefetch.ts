/**
 * useOptionsPrefetch Hook
 *
 * React hook for using the options prefetch service.
 * Provides easy access to cached options with automatic refresh capability.
 */

import { useCallback, useEffect, useState } from 'react'
import { optionsPrefetchService, CACHE_TTL } from '@/lib/workflows/configuration/optionsPrefetchService'
import { logger } from '@/lib/utils/logger'

interface UseOptionsPrefetchOptions {
  /** The option type identifier (e.g., 'slack:channels') */
  optionType: string
  /** Function to fetch the options */
  fetcher: () => Promise<any[]>
  /** Cache TTL in milliseconds */
  ttl?: number
  /** Additional cache key suffix (e.g., provider ID) */
  cacheKeySuffix?: string
  /** Whether to fetch immediately on mount */
  fetchOnMount?: boolean
  /** Dependencies that trigger refetch when changed */
  dependencies?: any[]
  /** Whether fetching is enabled */
  enabled?: boolean
}

interface UseOptionsPrefetchReturn<T = any> {
  /** The fetched options */
  options: T[]
  /** Whether options are currently being fetched */
  isLoading: boolean
  /** Error if fetch failed */
  error: Error | null
  /** Whether options are from cache */
  isCached: boolean
  /** Time remaining until cache expires (seconds) */
  cacheTimeRemaining: number
  /** Refresh options (bypasses cache) */
  refresh: () => Promise<void>
  /** Clear cache for this option type */
  clearCache: () => void
}

export function useOptionsPrefetch<T = any>({
  optionType,
  fetcher,
  ttl = CACHE_TTL.medium,
  cacheKeySuffix,
  fetchOnMount = true,
  dependencies = [],
  enabled = true,
}: UseOptionsPrefetchOptions): UseOptionsPrefetchReturn<T> {
  const [options, setOptions] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [isCached, setIsCached] = useState(false)

  const cacheKey = cacheKeySuffix ? `${optionType}:${cacheKeySuffix}` : optionType

  // Get cache time remaining
  const cacheTimeRemaining = optionsPrefetchService.getCacheTimeRemaining(optionType, cacheKey)

  // Fetch options
  const fetchOptions = useCallback(async (forceRefresh = false) => {
    if (!enabled) return

    setIsLoading(true)
    setError(null)

    try {
      // Check cache first (unless forcing refresh)
      if (!forceRefresh) {
        const cached = optionsPrefetchService.getCached(optionType, cacheKey)
        if (cached) {
          setOptions(cached)
          setIsCached(true)
          setIsLoading(false)
          return
        }
      }

      setIsCached(false)
      const data = await optionsPrefetchService.fetchOptions(
        optionType,
        fetcher,
        { ttl, cacheKey, forceRefresh }
      )
      setOptions(data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch options'))
      logger.error(`[useOptionsPrefetch] Error fetching ${optionType}:`, err)
    } finally {
      setIsLoading(false)
    }
  }, [optionType, cacheKey, fetcher, ttl, enabled])

  // Refresh function (bypasses cache)
  const refresh = useCallback(async () => {
    await fetchOptions(true)
  }, [fetchOptions])

  // Clear cache function
  const clearCache = useCallback(() => {
    optionsPrefetchService.clearCache(optionType, cacheKey)
    setOptions([])
    setIsCached(false)
  }, [optionType, cacheKey])

  // Fetch on mount if enabled
  useEffect(() => {
    if (fetchOnMount && enabled) {
      fetchOptions()
    }
  }, [fetchOnMount, enabled, ...dependencies])

  // Check for cached data on mount
  useEffect(() => {
    const cached = optionsPrefetchService.getCached(optionType, cacheKey)
    if (cached) {
      setOptions(cached)
      setIsCached(true)
    }
  }, [optionType, cacheKey])

  return {
    options,
    isLoading,
    error,
    isCached,
    cacheTimeRemaining,
    refresh,
    clearCache,
  }
}

/**
 * Hook to prefetch options for multiple nodes at once
 */
export function usePrefetchForPlan() {
  const [isPrefetching, setIsPrefetching] = useState(false)

  const prefetchForNodes = useCallback(async (
    nodes: Array<{ nodeType: string; providerId?: string }>,
    loadOptionsFn: (optionType: string, providerId?: string) => Promise<any[]>,
    isProviderConnected: (providerId: string) => boolean
  ) => {
    setIsPrefetching(true)
    try {
      await optionsPrefetchService.prefetchForNodes(nodes, loadOptionsFn, isProviderConnected)
    } finally {
      setIsPrefetching(false)
    }
  }, [])

  return {
    prefetchForNodes,
    isPrefetching,
  }
}

/**
 * Get cache statistics (useful for debugging)
 */
export function useOptionsCacheStats() {
  const [stats, setStats] = useState(optionsPrefetchService.getCacheStats())

  const refreshStats = useCallback(() => {
    setStats(optionsPrefetchService.getCacheStats())
  }, [])

  useEffect(() => {
    // Refresh stats every 10 seconds
    const interval = setInterval(refreshStats, 10000)
    return () => clearInterval(interval)
  }, [refreshStats])

  return { stats, refreshStats }
}

/**
 * Hook for prefetching options when user selects a provider in the action picker.
 * Use this in IntegrationsSidePanel to preload data before config modal opens.
 */
export function useProviderPrefetch() {
  const [currentProvider, setCurrentProvider] = useState<string | null>(null)
  const [prefetchStatus, setPrefetchStatus] = useState<'pending' | 'loading' | 'loaded' | 'error'>('pending')

  /**
   * Start prefetching for a provider when user selects it.
   * Automatically cancels any previous prefetch.
   */
  const prefetchForProvider = useCallback((providerId: string) => {
    logger.debug(`[useProviderPrefetch] Starting prefetch for ${providerId}`)

    // If switching providers, cancel the previous prefetch
    if (currentProvider && currentProvider !== providerId) {
      optionsPrefetchService.cancelProviderPrefetch(currentProvider)
    }

    setCurrentProvider(providerId)
    setPrefetchStatus('loading')

    // Start prefetch (don't await - runs in background)
    optionsPrefetchService.prefetchForProvider(providerId)
      .then(() => {
        setPrefetchStatus('loaded')
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          setPrefetchStatus('error')
        }
      })
  }, [currentProvider])

  /**
   * Cancel current prefetch (e.g., when closing side panel)
   */
  const cancelPrefetch = useCallback(() => {
    if (currentProvider) {
      optionsPrefetchService.cancelProviderPrefetch(currentProvider)
      setCurrentProvider(null)
      setPrefetchStatus('pending')
    }
  }, [currentProvider])

  /**
   * Prefetch for a specific node type (when user hovers over an action)
   */
  const prefetchForNodeType = useCallback((nodeType: string, providerId: string) => {
    optionsPrefetchService.prefetchForNodeType(nodeType, providerId)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      optionsPrefetchService.cancelAllPrefetches()
    }
  }, [])

  return {
    currentProvider,
    prefetchStatus,
    prefetchForProvider,
    prefetchForNodeType,
    cancelPrefetch,
    getProviderStatus: (providerId: string) => optionsPrefetchService.getProviderPrefetchStatus(providerId),
  }
}
