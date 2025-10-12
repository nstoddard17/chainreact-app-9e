import { useEffect, useRef, useCallback } from 'react'

import { logger } from '@/lib/utils/logger'

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
  const hasTimedOutRef = useRef(false)
  const attemptCountRef = useRef(0)

  const clearTimeoutSafe = useCallback(() => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current)
      timeoutIdRef.current = null
    }
  }, [])

  const loadData = useCallback(async (forceRefresh = forceRefreshOnMount) => {
    // Prevent duplicate concurrent loads
    if (loadingRef.current) {
      logger.debug('⏳ Load already in progress, skipping...')
      return
    }

    // Prevent infinite reload loops - max 2 attempts
    if (hasTimedOutRef.current && attemptCountRef.current >= 2) {
      logger.warn('⛔ Maximum reload attempts reached, stopping to prevent infinite loop')
      loadingRef.current = false
      return
    }

    try {
      loadingRef.current = true
      attemptCountRef.current++

      // Use more aggressive timeout in production (5 seconds)
      const isProduction = process.env.NODE_ENV === 'production'
      const effectiveTimeout = isProduction ? 5000 : timeout

      // Set a timeout to handle stuck loading states
      timeoutIdRef.current = setTimeout(() => {
        if ((isLoading || loadingRef.current) && isMountedRef.current) {
          logger.warn(`⚠️ Loading timeout after ${effectiveTimeout}ms`)
          hasTimedOutRef.current = true
          loadingRef.current = false

          // Only force reload once to prevent loops
          if (attemptCountRef.current === 1) {
            logger.debug('🔄 Attempting force reload...')
            loadFunction(true).catch(error => {
              logger.error('Force reload failed:', error)
              if (onError && isMountedRef.current) {
                onError(error)
              }
            }).finally(() => {
              loadingRef.current = false
            })
          } else {
            logger.debug('⏹️ Stopping reload attempts to prevent loop')
            // Just clear loading state and continue
            if (onError && isMountedRef.current) {
              onError(new Error('Loading timeout - data may be incomplete'))
            }
          }
        }
      }, effectiveTimeout)

      // Execute the load function
      const result = await loadFunction(forceRefresh)
      
      // Reset timeout flag on successful load
      hasTimedOutRef.current = false
      
      if (onSuccess && isMountedRef.current) {
        onSuccess(result)
      }

      return result
    } catch (error) {
      logger.error('Failed to load data:', error)

      if (onError && isMountedRef.current) {
        onError(error)
      }

      // Don't throw in production to prevent page crashes
      if (process.env.NODE_ENV === 'production') {
        return null
      }
      throw error
    } finally {
      loadingRef.current = false
      clearTimeoutSafe()
    }
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