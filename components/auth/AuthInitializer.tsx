"use client"

import { useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"

export default function AuthInitializer() {
  const { initialize, initialized, hydrated, user } = useAuthStore()

  useEffect(() => {
    const initializeApp = async () => {
      // Wait for hydration to complete
      if (!hydrated) {
        console.log("⏳ Waiting for auth store hydration...")
        return
      }

      console.log("✅ Auth store hydrated, checking initialization status...")

      if (!initialized) {
        console.log("🔄 Initializing auth after hydration...")
        await initialize()
        console.log("✅ Auth initialization complete")
      } else {
        console.log("✅ Auth already initialized", user?.email || "no user")

        // If we have a user but haven't started preloading, start it
        if (user) {
          console.log("🔄 Starting background preload for existing user...")
          setTimeout(async () => {
            try {
              const { useIntegrationStore } = await import("@/stores/integrationStore")
              const integrationStore = useIntegrationStore.getState()

              // Wait for integration store hydration
              let attempts = 0
              while (!integrationStore.hydrated && attempts < 20) {
                await new Promise((resolve) => setTimeout(resolve, 250))
                attempts++
              }

              // Only start if not already started
              if (!integrationStore.preloadStarted && !integrationStore.globalPreloadingData) {
                console.log("🚀 Starting fresh preload...")
                await integrationStore.fetchIntegrations(true)
                await integrationStore.initializeGlobalPreload()
                console.log("✅ Background preload completed for existing user")
              } else {
                console.log("✅ Preload already started or completed")
              }
            } catch (error) {
              console.error("❌ Background preload failed:", error)
            }
          }, 1000)
        }
      }
    }

    initializeApp()
  }, [initialize, initialized, hydrated, user])

  return null
}
