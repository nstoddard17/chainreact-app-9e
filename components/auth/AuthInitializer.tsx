"use client"

import { useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"

export default function AuthInitializer() {
  const { initialize, initialized } = useAuthStore()

  useEffect(() => {
    const initializeApp = async () => {
      if (!initialized) {
        console.log("🔄 Initializing auth...")
        await initialize()
        console.log("✅ Auth initialization complete")
      } else {
        console.log("✅ Auth already initialized")
      }
    }

    initializeApp()
  }, [initialize, initialized])

  return null // This component doesn't render anything
}
