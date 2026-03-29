"use client"

import { useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/authStore'

interface UseAuthReadyOptions {
  onReady?: () => void | Promise<void>
  onNotAuthenticated?: () => void
}

/**
 * Hook that fires callbacks when auth boot reaches 'ready' phase.
 */
export function useAuthReady({
  onReady,
  onNotAuthenticated,
}: UseAuthReadyOptions = {}) {
  const { user, phase } = useAuthStore()

  const checkAndExecute = useCallback(() => {
    if (phase !== 'ready') return

    if (user && onReady) {
      onReady()
    } else if (!user && onNotAuthenticated) {
      onNotAuthenticated()
    }
  }, [user, phase, onReady, onNotAuthenticated])

  useEffect(() => {
    checkAndExecute()
  }, [checkAndExecute])

  return {
    isReady: phase === 'ready',
    isAuthenticated: !!user,
    user
  }
}
