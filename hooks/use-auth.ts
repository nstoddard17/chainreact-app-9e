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
