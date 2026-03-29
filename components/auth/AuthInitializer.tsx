"use client"

import { useEffect, useRef } from "react"
import { useAuthStore } from "@/stores/authStore"
import { cleanupWorkflowLocalStorage } from '@/lib/utils/storage-cleanup'

/**
 * Safety-net boot trigger.
 *
 * The primary boot is triggered by onRehydrateStorage in the Zustand persist config.
 * This component handles the case where no persisted data exists (onRehydrateStorage
 * may not fire), and runs non-blocking localStorage cleanup.
 */
export default function AuthInitializer() {
  const boot = useAuthStore(s => s.boot)
  const phase = useAuthStore(s => s.phase)
  const cleanupStarted = useRef(false)

  // Clean up stale localStorage entries (non-blocking)
  useEffect(() => {
    if (!cleanupStarted.current) {
      cleanupStarted.current = true
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => cleanupWorkflowLocalStorage(), { timeout: 5000 })
      } else {
        setTimeout(() => cleanupWorkflowLocalStorage(), 1)
      }
    }
  }, [])

  // Safety net: if phase is still idle after mount, trigger boot
  useEffect(() => {
    if (phase === 'idle') {
      boot()
    }
  }, [phase, boot])

  return null
}
