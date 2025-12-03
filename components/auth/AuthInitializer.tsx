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
      requestIdleCallback(() => {
        cleanupWorkflowLocalStorage()
      }, { timeout: 5000 })
    }
  }, [])

  // Set hydrated state immediately on client mount
  useEffect(() => {
    if (!hydrateStarted.current) {
      hydrateStarted.current = true
      logger.debug("🔄 Setting hydrated state...")
      setHydrated()
    }
  }, [setHydrated])

  // Initialize auth once hydrated
  useEffect(() => {
    if (hydrated && !initialized && !initStarted.current) {
      initStarted.current = true
      logger.debug("🔄 Initializing auth...")
      initialize()
    }
  }, [hydrated, initialized, initialize])

  return null
}
