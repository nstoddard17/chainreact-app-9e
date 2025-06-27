"use client"

import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"

export function useAuth() {
  const { user, loading, initialized, hydrated, error } = useAuthStore()
  const [isReady, setIsReady] = useState(false)

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
    }, 15000) // 15 second fallback

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
