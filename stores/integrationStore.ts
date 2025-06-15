import { create } from "zustand"
import { devtools } from "zustand/middleware"
import { detectAvailableIntegrations, type IntegrationConfig } from "@/lib/integrations/availableIntegrations"

export interface Integration {
  id: string
  user_id: string
  provider: string
  provider_user_id?: string
  status: "connected" | "disconnected" | "error"
  access_token?: string
  refresh_token?: string
  expires_at?: string
  scopes?: string[]
  metadata?: any
  created_at: string
  updated_at: string
}

interface IntegrationStore {
  integrations: Integration[]
  providers: IntegrationConfig[]
  isLoading: boolean
  error: string | null

  // Actions
  initializeProviders: () => void
  fetchIntegrations: (force?: boolean) => Promise<void>
  connectIntegration: (providerId: string) => Promise<void>
  disconnectIntegration: (providerId: string) => Promise<void>
  refreshAllTokens: () => Promise<void>
  clearError: () => void
}

export const useIntegrationStore = create<IntegrationStore>()(
  devtools(
    (set, get) => ({
      integrations: [],
      providers: [],
      isLoading: false,
      error: null,

      initializeProviders: () => {
        try {
          const availableProviders = detectAvailableIntegrations()
          set({ providers: availableProviders })
        } catch (error) {
          console.error("Failed to initialize providers:", error)
          set({ error: "Failed to initialize integration providers" })
        }
      },

      fetchIntegrations: async (force = false) => {
        const { isLoading, integrations } = get()

        // Avoid duplicate requests unless forced
        if (isLoading && !force) return
        if (integrations.length > 0 && !force) return

        set({ isLoading: true, error: null })

        try {
          const response = await fetch("/api/integrations", {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          })

          if (!response.ok) {
            throw new Error(`Failed to fetch integrations: ${response.statusText}`)
          }

          const data = await response.json()

          if (data.success) {
            set({ integrations: data.integrations || [], isLoading: false })
          } else {
            throw new Error(data.error || "Failed to fetch integrations")
          }
        } catch (error: any) {
          console.error("Error fetching integrations:", error)
          set({
            error: error.message || "Failed to fetch integrations",
            isLoading: false,
          })
        }
      },

      connectIntegration: async (providerId: string) => {
        try {
          set({ error: null })

          // Generate OAuth URL
          const response = await fetch("/api/integrations/oauth/generate-url", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ provider: providerId }),
          })

          const data = await response.json()

          if (!data.success) {
            throw new Error(data.error || "Failed to generate OAuth URL")
          }

          // Open OAuth URL in new window
          const authWindow = window.open(data.authUrl, "oauth", "width=600,height=700,scrollbars=yes,resizable=yes")

          if (!authWindow) {
            throw new Error("Please allow popups for this site to connect integrations")
          }

          // Monitor the popup window
          const checkClosed = setInterval(() => {
            if (authWindow.closed) {
              clearInterval(checkClosed)
              // Refresh integrations after a short delay
              setTimeout(() => {
                get().fetchIntegrations(true)
              }, 1000)
            }
          }, 1000)
        } catch (error: any) {
          console.error(`Error connecting ${providerId}:`, error)
          set({ error: error.message || `Failed to connect ${providerId}` })
          throw error
        }
      },

      disconnectIntegration: async (providerId: string) => {
        try {
          set({ error: null })

          // Find the integration to disconnect
          const integration = get().integrations.find((i) => i.provider === providerId && i.status === "connected")

          if (!integration) {
            throw new Error("Integration not found or not connected")
          }

          const response = await fetch(`/api/integrations/${integration.id}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
          })

          const data = await response.json()

          if (!data.success) {
            throw new Error(data.error || "Failed to disconnect integration")
          }

          // Update local state
          set((state) => ({
            integrations: state.integrations.map((i) =>
              i.id === integration.id ? { ...i, status: "disconnected" as const } : i,
            ),
          }))
        } catch (error: any) {
          console.error(`Error disconnecting ${providerId}:`, error)
          set({ error: error.message || `Failed to disconnect ${providerId}` })
          throw error
        }
      },

      refreshAllTokens: async () => {
        try {
          set({ error: null })

          const response = await fetch("/api/integrations/refresh-all-tokens", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          })

          const data = await response.json()

          if (!data.success) {
            throw new Error(data.error || "Failed to refresh tokens")
          }

          // Refresh integrations list
          await get().fetchIntegrations(true)

          return data
        } catch (error: any) {
          console.error("Error refreshing tokens:", error)
          set({ error: error.message || "Failed to refresh tokens" })
          throw error
        }
      },

      clearError: () => {
        set({ error: null })
      },
    }),
    {
      name: "integration-store",
    },
  ),
)
