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

    // In production, be more aggressive about becoming ready
    const checkReady = () => {
      // Ready if hydrated OR if document is interactive/complete
      if (hydrated || document.readyState !== 'loading') {
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
    }, 50) // Check more frequently

    // Force ready after max wait time (1.5 seconds in production)
    const timeout = setTimeout(() => {
      console.warn('⚠️ Forcing app ready state after timeout')
      setIsReady(true)
      clearInterval(interval)
    }, 1500) // Reduced from 3000ms

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [hydrated, initialized])

  return isReady
}