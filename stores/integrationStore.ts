import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

interface Provider {
  id: string
  name: string
  description: string
  category: string
  logoUrl: string
  capabilities: string[]
  scopes: string[]
  isAvailable: boolean
}

interface Integration {
  id: string
  user_id: string
  provider: string
  provider_user_id?: string
  status: "connected" | "disconnected" | "error"
  access_token?: string
  refresh_token?: string
  expires_at?: number
  granted_scopes?: string[]
  missing_scopes?: string[]
  scope_validation_status?: "valid" | "invalid" | "partial"
  metadata?: any
  created_at: string
  updated_at: string
  last_refreshed?: string
}

interface IntegrationStore {
  providers: Provider[]
  integrations: Integration[]
  loading: boolean
  error: string | null
  refreshing: boolean
  lastRefreshed: string | null
  fetchIntegrations: (forceRefresh?: boolean) => Promise<void>
  connectIntegration: (providerId: string) => Promise<void>
  disconnectIntegration: (integrationId: string) => Promise<void>
  refreshTokens: () => Promise<{
    success: boolean
    message: string
    refreshedCount: number
  }>
}

export const useIntegrationStore = create<IntegrationStore>()(
  persist(
    (set, get) => ({
      providers: [],
      integrations: [],
      loading: false,
      error: null,
      refreshing: false,
      lastRefreshed: null,

      fetchIntegrations: async (forceRefresh = false) => {
        try {
          set({ loading: true, error: null })

          // Fetch providers
          const providersResponse = await fetch("/api/integrations/auth?type=providers")
          if (!providersResponse.ok) {
            throw new Error("Failed to fetch providers")
          }
          const providersData = await providersResponse.json()

          // Fetch user integrations
          const integrationsResponse = await fetch("/api/integrations/auth?type=integrations")
          if (!integrationsResponse.ok) {
            throw new Error("Failed to fetch integrations")
          }
          const integrationsData = await integrationsResponse.json()

          set({
            providers: providersData.providers || [],
            integrations: integrationsData.integrations || [],
            loading: false,
            lastRefreshed: new Date().toISOString(),
          })
        } catch (error: any) {
          console.error("Error fetching integrations:", error)
          set({
            error: error.message || "Failed to fetch integrations",
            loading: false,
          })
        }
      },

      connectIntegration: async (providerId: string) => {
        try {
          const response = await fetch("/api/integrations/auth/generate-url", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ provider: providerId }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.message || "Failed to generate auth URL")
          }

          const data = await response.json()
          window.location.href = data.url
        } catch (error: any) {
          console.error("Error connecting integration:", error)
          throw error
        }
      },

      disconnectIntegration: async (integrationId: string) => {
        try {
          const response = await fetch(`/api/integrations/auth`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ integrationId }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.message || "Failed to disconnect integration")
          }

          // Update local state
          const { integrations } = get()
          const updatedIntegrations = integrations.map((integration) =>
            integration.id === integrationId ? { ...integration, status: "disconnected" as const } : integration,
          )

          set({ integrations: updatedIntegrations })
        } catch (error: any) {
          console.error("Error disconnecting integration:", error)
          throw error
        }
      },

      refreshTokens: async () => {
        try {
          set({ refreshing: true })

          const response = await fetch("/api/integrations/refresh-tokens", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.message || "Failed to refresh tokens")
          }

          const data = await response.json()

          // Refresh the integrations list to get updated tokens
          await get().fetchIntegrations(true)

          set({
            refreshing: false,
            lastRefreshed: new Date().toISOString(),
          })

          return {
            success: data.success,
            message: data.message,
            refreshedCount: data.refreshed?.filter((r: any) => r.refreshed).length || 0,
          }
        } catch (error: any) {
          console.error("Error refreshing tokens:", error)
          set({ refreshing: false })

          return {
            success: false,
            message: error.message || "Failed to refresh tokens",
            refreshedCount: 0,
          }
        }
      },
    }),
    {
      name: "integration-store",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        providers: state.providers,
        integrations: state.integrations,
        lastRefreshed: state.lastRefreshed,
      }),
    },
  ),
)
