import { useEffect, useRef, useCallback } from 'react'

interface UseTimeoutLoadingOptions {
  /**
   * Function to load data
   */
  loadFunction: (force?: boolean) => Promise<any>
  /**
   * Whether loading is in progress
   */
  isLoading?: boolean
  /**
   * Timeout in milliseconds before forcing reload (default: 10000ms)
   */
  timeout?: number
  /**
   * Whether to force refresh on mount (default: true)
   */
  forceRefreshOnMount?: boolean
  /**
   * Callback when loading fails
   */
  onError?: (error: any) => void
  /**
   * Callback when loading succeeds
   */
  onSuccess?: (data: any) => void
  /**
   * Dependencies that should trigger reload
   */
  dependencies?: any[]
}

/**
 * Hook to handle loading with timeout and stuck request prevention
 * Ensures pages never get stuck on loading and load as fast as possible
 */
export function useTimeoutLoading({
  loadFunction,
  isLoading = false,
  timeout = 10000,
  forceRefreshOnMount = true,
  onError,
  onSuccess,
  dependencies = []
}: UseTimeoutLoadingOptions) {
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)
  const loadingRef = useRef(false)

  const clearTimeoutSafe = useCallback(() => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current)
      timeoutIdRef.current = null
    }
  }, [])

  const loadData = useCallback(async (forceRefresh = forceRefreshOnMount) => {
    // Prevent duplicate concurrent loads
    if (loadingRef.current) {
      console.log('⏳ Load already in progress, skipping...')
      return
    }

    loadingRef.current = true

    // Fire and forget - don't block navigation
    loadFunction(forceRefresh)
      .then(result => {
        if (onSuccess && isMountedRef.current) {
          onSuccess(result)
        }
        loadingRef.current = false
        clearTimeoutSafe()
      })
      .catch(error => {
        console.error('Failed to load data:', error)
        if (onError && isMountedRef.current) {
          onError(error)
        }
        loadingRef.current = false
        clearTimeoutSafe()
      })

    // Set a longer timeout as safety net only (60 seconds)
    timeoutIdRef.current = setTimeout(() => {
      if ((isLoading || loadingRef.current) && isMountedRef.current) {
        console.warn(`⚠️ Loading taking unusually long (>${timeout}ms) - data may still load`)
        loadingRef.current = false
        // Don't force reload - just reset loading state to unblock UI
      }
    }, Math.max(timeout, 60000)) // Minimum 60 second timeout

    // Return immediately without blocking
    return Promise.resolve()
  }, [loadFunction, isLoading, timeout, forceRefreshOnMount, onError, onSuccess, clearTimeoutSafe])

  // Load on mount and when dependencies change
  useEffect(() => {
    isMountedRef.current = true
    loadData()

    return () => {
      isMountedRef.current = false
      clearTimeoutSafe()
    }
  }, [...dependencies]) // eslint-disable-line react-hooks/exhaustive-deps

  // Return the load function for manual refresh
  return {
    refresh: () => loadData(true),
    loadData
  }
}