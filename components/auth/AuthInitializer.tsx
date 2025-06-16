"use client"

import { useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"

export default function AuthInitializer() {
  const { initialize, initialized, hydrated, user } = useAuthStore()

  useEffect(() => {
    if (!hydrated) {
      console.log("⏳ Waiting for auth store hydration...")
      return
    }

    if (!initialized) {
      console.log("🔄 Initializing auth after hydration...")
      initialize()
    }
  }, [hydrated, initialized, initialize])

  return null
}
