import { create } from "zustand"
import { persist } from "zustand/middleware"
import { apiClient } from "@/lib/apiClient"
import { detectAvailableIntegrations, type IntegrationConfig } from "@/lib/integrations/availableIntegrations"

export interface Integration {
  id: string
  provider: string
  name: string
  status: "connected" | "disconnected" | "error" | "pending"
  connectedAt?: string
  lastSync?: string
  error?: string
  scopes?: string[]
  metadata?: Record<string, any>
  updated_at?: string
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

interface IntegrationStore {
  // State
  integrations: Integration[]
  providers: IntegrationConfig[]
  dynamicData: DynamicData
  isLoading: boolean
  error: string | null
  lastFetch: number | null

  // Loading states for specific operations
  loadingStates: Record<string, boolean>

  // Actions
  initializeProviders: () => void
  fetchIntegrations: (force?: boolean) => Promise<void>
  connectIntegration: (providerId: string) => Promise<void>
  disconnectIntegration: (integrationId: string) => Promise<void>
  refreshIntegration: (integrationId: string) => Promise<void>
  refreshAllTokens: () => Promise<void>

  // Dynamic data methods
  getDynamicData: (provider: string, dataType: string) => any[]
  fetchDynamicData: (provider: string, dataType: string) => Promise<void>
  isResourceLoading: (provider: string, dataType: string) => boolean

  // Utility methods
  getIntegrationStatus: (providerId: string) => string
  getConnectedProviders: () => string[]
  clearError: () => void
  setLoading: (key: string, loading: boolean) => void
}

// Mock data for development/offline mode
const MOCK_INTEGRATIONS: Integration[] = [
  {
    id: "notion-1",
    provider: "notion",
    name: "Notion Workspace",
    status: "connected",
    connectedAt: new Date().toISOString(),
    lastSync: new Date().toISOString(),
  },
  {
    id: "slack-1",
    provider: "slack",
    name: "Slack Workspace",
    status: "connected",
    connectedAt: new Date().toISOString(),
    lastSync: new Date().toISOString(),
  },
]

const MOCK_DYNAMIC_DATA: DynamicData = {
  notion: {
    pages: [
      { id: "page-1", name: "Project Planning", value: "page-1" },
      { id: "page-2", name: "Meeting Notes", value: "page-2" },
    ],
    databases: [
      { id: "db-1", name: "Tasks Database", value: "db-1" },
      { id: "db-2", name: "Projects Database", value: "db-2" },
    ],
  },
  slack: {
    channels: [
      { id: "channel-1", name: "#general", value: "channel-1" },
      { id: "channel-2", name: "#development", value: "channel-2" },
    ],
    users: [
      { id: "user-1", name: "John Doe", value: "user-1" },
      { id: "user-2", name: "Jane Smith", value: "user-2" },
    ],
  },
}

export const useIntegrationStore = create<IntegrationStore>()(
  persist(
    (set, get) => ({
      // Initial state
      integrations: [],
      providers: [],
      dynamicData: {},
      isLoading: false,
      error: null,
      lastFetch: null,
      loadingStates: {},

      // Initialize providers based on environment variables
      initializeProviders: () => {
        const availableProviders = detectAvailableIntegrations()
        console.log("🔧 Detected integrations:", {
          total: availableProviders.length,
          available: availableProviders.filter((p) => p.isAvailable).length,
          unavailable: availableProviders.filter((p) => !p.isAvailable).length,
        })

        set({ providers: availableProviders })
      },

      // Fetch integrations with fallback to mock data
      fetchIntegrations: async (force = false) => {
        const { setLoading, lastFetch } = get()

        // Skip if recently fetched and not forced
        if (!force && lastFetch && Date.now() - lastFetch < 30000) {
          return
        }

        setLoading("fetchIntegrations", true)

        try {
          console.log("🔄 Fetching integrations...")
          const response = await apiClient.get("/api/integrations")

          if (response.success && response.data) {
            set({
              integrations: response.data,
              error: null,
              lastFetch: Date.now(),
            })
            console.log("✅ Integrations fetched successfully:", response.data.length)
          } else {
            throw new Error(response.error || "Failed to fetch integrations")
          }
        } catch (error: any) {
          console.warn("⚠️ Failed to fetch integrations, using mock data:", error.message)

          // Use mock data as fallback
          set({
            integrations: MOCK_INTEGRATIONS,
            dynamicData: MOCK_DYNAMIC_DATA,
            error: null, // Don't show error for mock data
            lastFetch: Date.now(),
          })
        } finally {
          setLoading("fetchIntegrations", false)
        }
      },

      // Connect integration
      connectIntegration: async (providerId: string) => {
        const { setLoading, providers } = get()
        const provider = providers.find((p) => p.id === providerId)

        if (!provider) {
          throw new Error(`Provider ${providerId} not found`)
        }

        if (!provider.isAvailable) {
          throw new Error(`${provider.name} integration is not configured. Missing environment variables.`)
        }

        setLoading(`connect-${providerId}`, true)

        try {
          console.log(`🔗 Connecting to ${providerId}...`)

          // Generate OAuth URL
          const response = await apiClient.post("/api/integrations/auth/generate-url", {
            provider: providerId,
          })

          if (response.success && response.data?.authUrl) {
            // Open OAuth URL in new window
            const popup = window.open(
              response.data.authUrl,
              "_blank",
              "width=600,height=700,scrollbars=yes,resizable=yes",
            )

            if (!popup) {
              throw new Error("Popup blocked. Please allow popups for this site to connect integrations.")
            }

            console.log(`✅ OAuth URL opened for ${providerId}`)
          } else {
            throw new Error(response.error || "Failed to generate OAuth URL")
          }
        } catch (error: any) {
          console.error(`❌ Failed to connect ${providerId}:`, error)
          set({ error: error.message })
          throw error
        } finally {
          setLoading(`connect-${providerId}`, false)
        }
      },

      // Disconnect integration
      disconnectIntegration: async (integrationId: string) => {
        const { setLoading } = get()
        setLoading(`disconnect-${integrationId}`, true)

        try {
          const response = await apiClient.delete(`/api/integrations/${integrationId}`)

          if (response.success) {
            set((state) => ({
              integrations: state.integrations.filter((i) => i.id !== integrationId),
            }))
          } else {
            throw new Error(response.error || "Failed to disconnect integration")
          }
        } catch (error: any) {
          console.error("Failed to disconnect integration:", error)
          set({ error: error.message })
          throw error
        } finally {
          setLoading(`disconnect-${integrationId}`, false)
        }
      },

      // Refresh integration
      refreshIntegration: async (integrationId: string) => {
        const { setLoading } = get()
        setLoading(`refresh-${integrationId}`, true)

        try {
          const response = await apiClient.post(`/api/integrations/${integrationId}/refresh`)

          if (response.success) {
            // Update the integration in the store
            set((state) => ({
              integrations: state.integrations.map((i) =>
                i.id === integrationId ? { ...i, lastSync: new Date().toISOString(), status: "connected" } : i,
              ),
            }))
          } else {
            throw new Error(response.error || "Failed to refresh integration")
          }
        } catch (error: any) {
          console.error("Failed to refresh integration:", error)
          set({ error: error.message })
          throw error
        } finally {
          setLoading(`refresh-${integrationId}`, false)
        }
      },

      // Refresh all tokens
      refreshAllTokens: async () => {
        const { setLoading } = get()
        setLoading("refreshAllTokens", true)

        try {
          const response = await apiClient.post("/api/integrations/refresh-all-tokens")

          if (response.success) {
            // Refresh integrations list after token refresh
            await get().fetchIntegrations(true)
            return response.data
          } else {
            throw new Error(response.error || "Failed to refresh tokens")
          }
        } catch (error: any) {
          console.error("Failed to refresh all tokens:", error)
          set({ error: error.message })
          throw error
        } finally {
          setLoading("refreshAllTokens", false)
        }
      },

      // Get dynamic data with fallback to mock data
      getDynamicData: (provider: string, dataType: string) => {
        const { dynamicData } = get()
        return dynamicData[provider]?.[dataType] || MOCK_DYNAMIC_DATA[provider]?.[dataType] || []
      },

      // Fetch dynamic data
      fetchDynamicData: async (provider: string, dataType: string) => {
        const { setLoading } = get()
        const key = `${provider}-${dataType}`
        setLoading(key, true)

        try {
          const response = await apiClient.post("/api/integrations/fetch-user-data", {
            provider,
            dataType,
          })

          if (response.success && response.data) {
            set((state) => ({
              dynamicData: {
                ...state.dynamicData,
                [provider]: {
                  ...state.dynamicData[provider],
                  [dataType]: response.data,
                },
              },
            }))
          } else {
            // Use mock data as fallback
            const mockData = MOCK_DYNAMIC_DATA[provider]?.[dataType] || []
            set((state) => ({
              dynamicData: {
                ...state.dynamicData,
                [provider]: {
                  ...state.dynamicData[provider],
                  [dataType]: mockData,
                },
              },
            }))
          }
        } catch (error: any) {
          console.warn(`Failed to fetch ${provider} ${dataType}, using mock data:`, error)

          // Use mock data as fallback
          const mockData = MOCK_DYNAMIC_DATA[provider]?.[dataType] || []
          set((state) => ({
            dynamicData: {
              ...state.dynamicData,
              [provider]: {
                ...state.dynamicData[provider],
                [dataType]: mockData,
              },
            },
          }))
        } finally {
          setLoading(key, false)
        }
      },

      // Check if resource is loading
      isResourceLoading: (provider: string, dataType: string) => {
        const { loadingStates } = get()
        return loadingStates[`${provider}-${dataType}`] || false
      },

      // Get integration status
      getIntegrationStatus: (providerId: string) => {
        const { integrations } = get()
        const integration = integrations.find((i) => i.provider === providerId)
        return integration?.status || "disconnected"
      },

      // Get connected providers
      getConnectedProviders: () => {
        const { integrations } = get()
        return integrations.filter((i) => i.status === "connected").map((i) => i.provider)
      },

      // Utility methods
      clearError: () => set({ error: null }),

      setLoading: (key: string, loading: boolean) => {
        set((state) => ({
          loadingStates: {
            ...state.loadingStates,
            [key]: loading,
          },
        }))
      },
    }),
    {
      name: "integration-store",
      partialize: (state) => ({
        integrations: state.integrations,
        dynamicData: state.dynamicData,
        lastFetch: state.lastFetch,
      }),
    },
  ),
)
