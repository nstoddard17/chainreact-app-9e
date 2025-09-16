import { useEffect, useRef, useCallback } from 'react'
import { clearStuckRequests } from '@/stores/cacheStore'

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
   * Whether to clear stuck requests before loading (default: true)
   */
  clearStuck?: boolean
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
  clearStuck = true,
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

    try {
      loadingRef.current = true

      // Clear any stuck requests before starting
      if (clearStuck) {
        clearStuckRequests()
      }

      // Set a timeout to handle stuck loading states
      timeoutIdRef.current = setTimeout(() => {
        if ((isLoading || loadingRef.current) && isMountedRef.current) {
          console.warn(`⚠️ Loading timeout after ${timeout}ms - clearing stuck requests and forcing reload`)
          // Clear stuck requests and force reload
          clearStuckRequests()
          loadingRef.current = false
          loadFunction(true).catch(error => {
            console.error('Force reload failed:', error)
            if (onError && isMountedRef.current) {
              onError(error)
            }
          })
        }
      }, timeout)

      // Load the data
      const result = await loadFunction(forceRefresh)

      if (onSuccess && isMountedRef.current) {
        onSuccess(result)
      }

      return result
    } catch (error) {
      console.error('Failed to load data:', error)

      // Clear stuck requests on error
      if (clearStuck) {
        clearStuckRequests()
      }

      if (onError && isMountedRef.current) {
        onError(error)
      }

      throw error
    } finally {
      loadingRef.current = false
      clearTimeoutSafe()
    }
  }, [loadFunction, isLoading, timeout, clearStuck, forceRefreshOnMount, onError, onSuccess, clearTimeoutSafe])

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