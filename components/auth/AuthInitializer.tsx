"use client"

import { useEffect, useRef } from "react"
import { useAuthStore } from "@/stores/authStore"

import { logger } from '@/lib/utils/logger'

export default function AuthInitializer() {
  const { initialize, initialized, hydrated, setHydrated } = useAuthStore()
  const initStarted = useRef(false)
  const hydrateStarted = useRef(false)

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
