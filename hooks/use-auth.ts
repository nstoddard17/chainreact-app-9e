"use client"

import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"

import { logger } from '@/lib/utils/logger'

export function useAuth() {
  const { user, loading, initialized, hydrated, error, initialize, setHydrated } = useAuthStore()
  const [isReady, setIsReady] = useState(false)

  // Ensure store is hydrated on mount
  useEffect(() => {
    if (!hydrated) {
      setHydrated()
    }
  }, [hydrated, setHydrated])

  // Initialize auth if needed
  useEffect(() => {
    if (hydrated && !initialized && !loading) {
      initialize()
    }
  }, [hydrated, initialized, loading, initialize])

  useEffect(() => {
    // Auth is ready when it's hydrated and initialized
    if (hydrated && initialized) {
      setIsReady(true)
    }
  }, [hydrated, initialized])

  // Fallback timeout to prevent infinite loading - faster for production
  useEffect(() => {
    const isProduction = process.env.NODE_ENV === 'production'
    const timeoutDuration = isProduction ? 2000 : 5000 // 2s in prod, 5s in dev

    const fallbackTimeout = setTimeout(() => {
      if (!isReady && !loading) {
        logger.warn("Auth hook fallback: forcing ready state after timeout")
        setIsReady(true)
      }
    }, timeoutDuration)

    return () => clearTimeout(fallbackTimeout)
  }, [isReady, loading])

  return {
    user,
    loading,
    initialized,
    hydrated,
    error,
    isReady,
    isAuthenticated: !!user && isReady,
  }
}
