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

  const isUsable = phase === 'ready' || phase === 'degraded'

  const checkAndExecute = useCallback(() => {
    if (!isUsable) return

    if (user && onReady) {
      onReady()
    } else if (!user && onNotAuthenticated) {
      onNotAuthenticated()
    }
  }, [user, isUsable, onReady, onNotAuthenticated])

  useEffect(() => {
    checkAndExecute()
  }, [checkAndExecute])

  return {
    isReady: isUsable,
    isAuthenticated: !!user,
    user
  }
}
