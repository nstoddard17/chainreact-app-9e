"use client"

import { useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/authStore'

interface UseAuthReadyOptions {
  onReady?: () => void | Promise<void>
  onNotAuthenticated?: () => void
  waitForHydration?: boolean
}

/**
 * Hook that ensures auth is fully initialized and hydrated before running callbacks.
 * This prevents race conditions where data is fetched before auth is ready.
 */
export function useAuthReady({
  onReady,
  onNotAuthenticated,
  waitForHydration = true
}: UseAuthReadyOptions = {}) {
  const { user, initialized, hydrated, initialize } = useAuthStore()

  const checkAndExecute = useCallback(() => {
    // Skip if not initialized
    if (!initialized) return

    // Skip if waiting for hydration and not hydrated
    if (waitForHydration && !hydrated) return

    // Execute appropriate callback
    if (user && onReady) {
      onReady()
    } else if (!user && onNotAuthenticated) {
      onNotAuthenticated()
    }
  }, [user, initialized, hydrated, waitForHydration, onReady, onNotAuthenticated])

  useEffect(() => {
    // Initialize auth if not already done
    if (!initialized) {
      initialize()
    }
  }, [initialized, initialize])

  useEffect(() => {
    checkAndExecute()
  }, [checkAndExecute])

  return {
    isReady: initialized && (!waitForHydration || hydrated),
    isAuthenticated: !!user,
    user
  }
}