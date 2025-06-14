"use client"

import { useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"

export default function AuthInitializer() {
  const { initialize, initialized, hydrated, user } = useAuthStore()

  useEffect(() => {
    const initializeApp = async () => {
      // Wait for hydration to complete
      if (!hydrated) {
        console.log("⏳ Waiting for store hydration...")
        return
      }

      if (!initialized) {
        console.log("🔄 Initializing auth...")
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

              // Only start if not already started
              if (!integrationStore.preloadStarted) {
                await integrationStore.fetchIntegrations(true)
                await integrationStore.initializeGlobalPreload()
                console.log("✅ Background preload completed for existing user")
              }
            } catch (error) {
              console.error("Background preload failed:", error)
            }
          }, 500)
        }
      }
    }

    initializeApp()
  }, [initialize, initialized, hydrated, user])

  return null
}
