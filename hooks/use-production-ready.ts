"use client"

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'

/**
 * Hook to handle production cold starts and ensure app is ready
 */
export function useProductionReady() {
  const [isReady, setIsReady] = useState(false)
  const { hydrated, initialized } = useAuthStore()

  useEffect(() => {
    // Check if we're in production
    const isProduction = process.env.NODE_ENV === 'production'

    if (!isProduction) {
      // In development, ready immediately after hydration
      if (hydrated) {
        setIsReady(true)
      }
      return
    }

    // In production, wait a bit longer for cold starts
    const checkReady = () => {
      // Check if basic requirements are met
      if (hydrated && (initialized || document.readyState === 'complete')) {
        setIsReady(true)
        return true
      }
      return false
    }

    // Initial check
    if (checkReady()) return

    // Set up interval to check readiness
    const interval = setInterval(() => {
      if (checkReady()) {
        clearInterval(interval)
      }
    }, 100)

    // Force ready after max wait time (3 seconds in production)
    const timeout = setTimeout(() => {
      console.warn('⚠️ Forcing app ready state after timeout')
      setIsReady(true)
      clearInterval(interval)
    }, 3000)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [hydrated, initialized])

  return isReady
}