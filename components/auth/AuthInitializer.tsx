"use client"

import { useEffect, useRef } from "react"
import { useAuthStore } from "@/stores/authStore"

import { logger } from '@/lib/utils/logger'
import { cleanupWorkflowLocalStorage } from '@/lib/utils/storage-cleanup'

export default function AuthInitializer() {
  const { initialize, initialized, hydrated, setHydrated } = useAuthStore()
  const initStarted = useRef(false)
  const hydrateStarted = useRef(false)
  const cleanupStarted = useRef(false)

  // Clean up stale localStorage entries on app startup
  useEffect(() => {
    if (!cleanupStarted.current) {
      cleanupStarted.current = true
      // Run cleanup asynchronously to not block app startup
      // Use requestIdleCallback with fallback for older browsers (iOS Safari < 16)
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          cleanupWorkflowLocalStorage()
        }, { timeout: 5000 })
      } else {
        setTimeout(() => {
          cleanupWorkflowLocalStorage()
        }, 1)
      }
    }
  }, [])

  // Set hydrated state immediately on client mount
  useEffect(() => {
    if (!hydrateStarted.current) {
      hydrateStarted.current = true
      logger.info("🔄 Setting hydrated state...")
      setHydrated()
    }
  }, [setHydrated])

  // Initialize auth once hydrated
  useEffect(() => {
    if (hydrated && !initialized && !initStarted.current) {
      initStarted.current = true
      logger.info("🔄 Initializing auth...")
      initialize()
    }
  }, [hydrated, initialized, initialize])

  return null
}
