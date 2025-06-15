"use client"

import { useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"

export function useAuth() {
  const {
    user,
    loading,
    initialized,
    error,
    hydrated,
    initialize,
    signOut,
    signIn,
    signUp,
    signInWithGoogle,
    clearError,
  } = useAuthStore()

  useEffect(() => {
    if (hydrated && !initialized) {
      initialize()
    }
  }, [hydrated, initialized, initialize])

  return {
    user,
    loading,
    initialized,
    error,
    isAuthenticated: !!user,
    isReady: hydrated && initialized,
    signOut,
    signIn,
    signUp,
    signInWithGoogle,
    clearError,
  }
}
