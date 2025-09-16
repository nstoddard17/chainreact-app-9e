"use client"

import { useEffect, useRef } from "react"
import { useAuthStore } from "@/stores/authStore"
import { clearStuckRequests } from "@/stores/cacheStore"

export default function AuthInitializer() {
  const { initialize, initialized, hydrated } = useAuthStore()
  const initStarted = useRef(false)
  const cleanupDone = useRef(false)

  useEffect(() => {
    // Clear any stuck requests on app initialization (once only)
    if (!cleanupDone.current) {
      cleanupDone.current = true
      console.log("🧹 Clearing any stuck requests from previous session...")
      clearStuckRequests(60000) // Clear requests older than 60 seconds on startup
    }

    if (!hydrated) {
      console.log("⏳ Waiting for auth store hydration...")
      return
    }

    if (!initialized && !initStarted.current) {
      initStarted.current = true
      console.log("🔄 Initializing auth after hydration...")
      initialize()
    }
  }, [hydrated, initialized, initialize])

  return null
}
