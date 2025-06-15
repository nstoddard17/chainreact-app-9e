"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface Integration {
  id: string
  user_id: string
  provider: string
  provider_user_id: string
  status: "connected" | "disconnected" | "error"
  access_token?: string
  refresh_token?: string
  expires_at?: string
  scopes?: string[]
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
  last_sync?: string
  error_message?: string
}

interface DynamicData {
  [provider: string]: {
    [dataType: string]: Array<{
      id: string
      name: string
      value: string
      metadata?: Record<string, any>
    }>
  }
}

interface IntegrationState {
  integrations: Integration[]
  loading: boolean
  error: string | null
  initialized: boolean
  debugInfo: any

  // Actions
  fetchIntegrations: (force?: boolean) => Promise<void>
  connectIntegration: (provider: string) => Promise<void>
  disconnectIntegration: (integrationId: string) => Promise<void>
  getIntegrationByProvider: (provider: string) => Integration | undefined
  getIntegrationStatus: (provider: string) => string
  clearAllData: () => void
  initializeGlobalPreload: () => Promise<void>
  connectTwitterWithPopup: (userId: string) => Promise<void>
}

export const useIntegrationStore = create<IntegrationState>()(
  persist(
    (set, get) => ({
      integrations: [],
      loading: false,
      error: null,
      initialized: false,
      debugInfo: null,

      fetchIntegrations: async (force = false) => {
        const state = get()
        if (state.loading && !force) return

        try {
          set({ loading: true, error: null })
          console.log("🔄 Fetching integrations...")

          const response = await fetch("/api/integrations", {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
          }

          const data = await response.json()
          console.log("✅ Integrations fetched:", data.count || 0)

          set({
            integrations: data.data || [],
            loading: false,
            initialized: true,
            debugInfo: {
              lastFetch: new Date().toISOString(),
              count: data.count || 0,
              userId: data.user_id,
            },
          })
        } catch (error: any) {
          console.error("❌ Failed to fetch integrations:", error)
          set({
            error: error.message,
            loading: false,
            initialized: true,
            debugInfo: {
              lastError: error.message,
              lastErrorTime: new Date().toISOString(),
            },
          })
        }
      },

      connectTwitterWithPopup: async (userId: string) => {
        try {
          console.log("🐦 Starting Twitter OAuth with popup...")

          // Generate OAuth URL
          const response = await fetch("/api/integrations/oauth/generate-url", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              provider: "twitter",
              userId,
            }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || "Failed to generate OAuth URL")
          }

          const { authUrl } = await response.json()
          console.log("🐦 OAuth URL generated, opening popup...")

          // Open popup window
          const popup = window.open(
            authUrl,
            "twitter-oauth",
            "width=600,height=700,scrollbars=yes,resizable=yes,status=yes,location=yes,toolbar=no,menubar=no",
          )

          if (!popup) {
            throw new Error("Failed to open popup window. Please allow popups for this site.")
          }

          // Monitor popup for completion
          return new Promise<void>((resolve, reject) => {
            const checkClosed = setInterval(() => {
              if (popup.closed) {
                clearInterval(checkClosed)
                console.log("🐦 Popup closed, checking for integration...")

                // Wait a moment then refresh integrations
                setTimeout(async () => {
                  try {
                    await get().fetchIntegrations(true)
                    const twitterIntegration = get().getIntegrationByProvider("twitter")

                    if (twitterIntegration && twitterIntegration.status === "connected") {
                      console.log("✅ Twitter integration successful!")
                      resolve()
                    } else {
                      console.log("❌ Twitter integration not found or failed")
                      reject(new Error("Twitter integration was not completed successfully"))
                    }
                  } catch (error) {
                    reject(error)
                  }
                }, 2000)
              }
            }, 1000)

            // Timeout after 5 minutes
            setTimeout(() => {
              clearInterval(checkClosed)
              if (!popup.closed) {
                popup.close()
              }
              reject(new Error("Twitter authentication timed out"))
            }, 300000)
          })
        } catch (error: any) {
          console.error("🐦 Twitter OAuth error:", error)
          throw error
        }
      },

      connectIntegration: async (provider: string) => {
        try {
          console.log(`🔗 Connecting ${provider} integration...`)

          // Special handling for Twitter
          if (provider === "twitter") {
            const { useAuthStore } = await import("./authStore")
            const userId = useAuthStore.getState().getCurrentUserId()

            if (!userId) {
              throw new Error("User not authenticated")
            }

            await get().connectTwitterWithPopup(userId)
            return
          }

          // For other providers, use the existing redirect flow
          const response = await fetch("/api/integrations/oauth/generate-url", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ provider }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || `Failed to generate ${provider} OAuth URL`)
          }

          const { authUrl } = await response.json()
          console.log(`🔗 Redirecting to ${provider} OAuth...`)

          // Store connecting state
          localStorage.setItem("integration_connecting", provider)

          // Redirect to OAuth provider
          window.location.href = authUrl
        } catch (error: any) {
          console.error(`❌ Failed to connect ${provider}:`, error)
          throw error
        }
      },

      disconnectIntegration: async (integrationId: string) => {
        try {
          console.log(`🔌 Disconnecting integration ${integrationId}...`)

          const response = await fetch(`/api/integrations/${integrationId}`, {
            method: "DELETE",
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || "Failed to disconnect integration")
          }

          console.log("✅ Integration disconnected")

          // Refresh integrations list
          await get().fetchIntegrations(true)
        } catch (error: any) {
          console.error("❌ Failed to disconnect integration:", error)
          throw error
        }
      },

      getIntegrationByProvider: (provider: string) => {
        return get().integrations.find((integration) => integration.provider === provider)
      },

      getIntegrationStatus: (provider: string) => {
        const integration = get().getIntegrationByProvider(provider)
        return integration?.status || "disconnected"
      },

      clearAllData: () => {
        set({
          integrations: [],
          loading: false,
          error: null,
          initialized: false,
          debugInfo: null,
        })
      },

      initializeGlobalPreload: async () => {
        try {
          console.log("🚀 Initializing global data preload...")
          // Add any global data preloading logic here
          console.log("✅ Global preload completed")
        } catch (error) {
          console.error("❌ Global preload failed:", error)
        }
      },
    }),
    {
      name: "chainreact-integrations",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        integrations: state.integrations,
        initialized: state.initialized,
      }),
    },
  ),
)
