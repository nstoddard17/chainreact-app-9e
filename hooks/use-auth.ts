"use client"

import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"

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

  // Fallback timeout to prevent infinite loading
  useEffect(() => {
    const fallbackTimeout = setTimeout(() => {
      if (!isReady && !loading) {
        console.warn("Auth hook fallback: forcing ready state after timeout")
        setIsReady(true)
      }
    }, 5000) // 5 second fallback

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
