"use client"

import { useEffect, useRef } from "react"
import { useAuthStore } from "@/stores/authStore"

export default function AuthInitializer() {
  const { initialize, initialized, hydrated } = useAuthStore()
  const initStarted = useRef(false)

  useEffect(() => {
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
