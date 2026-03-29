"use client"

import { useAuthStore } from "@/stores/authStore"

/**
 * Thin auth hook. Reads boot phase — no fallback timeouts, no side effects.
 */
export function useAuth() {
  const { user, loading, error, phase } = useAuthStore()

  return {
    user,
    loading,
    error,
    phase,
    isReady: phase === 'ready',
    isAuthenticated: !!user && phase === 'ready',
  }
}
