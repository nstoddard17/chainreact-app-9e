import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { detectAvailableIntegrations, type IntegrationConfig } from "@/lib/integrations/availableIntegrations"
import { initializePreloadingForUser } from "@/lib/integrations/globalDataPreloader"
import { validateAllIntegrations, validateAndUpdateIntegrationScopes } from "@/lib/integrations/scopeValidation"

export interface Integration {
  id: string
  user_id: string
  provider: string
  provider_user_id?: string
  status: "connected" | "disconnected" | "error" | "pending"
  access_token?: string
  refresh_token?: string
  expires_at?: string | null
  scopes?: string[]
  granted_scopes?: string[]
  missing_scopes?: string[]
  scope_validation_status?: "valid" | "invalid" | "partial"
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
  last_sync?: string
  last_scope_check?: string
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

interface PreloadProgress {
  [provider: string]: boolean
}

interface IntegrationStore {
  // State
  integrations: Integration[]
  providers: IntegrationConfig[]
  dynamicData: DynamicData
  isLoading: boolean
  error: string | null
  lastFetch: number | null
  debugInfo: any
  initialized: boolean
  preloadStarted: boolean
  globalPreloadingData: boolean
  verifyingScopes: boolean
  preloadProgress: PreloadProgress

  // Loading states for specific operations
  loadingStates: Record<string, boolean>

  // Actions
  initializeProviders: () => void
  fetchIntegrations: (force?: boolean) => Promise<void>
  connectIntegration: (providerId: string) => Promise<void>
  disconnectIntegration: (integrationId: string) => Promise<void>
  refreshIntegration: (integrationId: string) => Promise<void>
  refreshAllTokens: () => Promise<{ stats?: { successful: number; skipped: number; failed: number } }>

  // Dynamic data methods
  getDynamicData: (provider: string, dataType: string) => any[]
  fetchDynamicData: (provider: string, dataType: string) => Promise<void>
  isResourceLoading: (provider: string, dataType: string) => boolean

  // Preloading methods
  ensureDataPreloaded: () => Promise<void>
  startGlobalPreload: (connectedProviders: string[]) => Promise<void>

  // Scope validation methods
  verifyIntegrationScopes: () => Promise<void>
  validateProviderScopes: (provider: string) => Promise<void>

  // Utility methods
  getIntegrationStatus: (providerId: string) => string
  getConnectedProviders: () => string[]
  getIntegrationByProvider: (providerId: string) => Integration | null
  clearError: () => void
  setLoading: (key: string, loading: boolean) => void
  setDebugInfo: (info: any) => void
  clearAllData: () => void
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
      debugInfo: null,
      initialized: false,
      preloadStarted: false,
      globalPreloadingData: false,
      verifyingScopes: false,
      preloadProgress: {},

      // Initialize providers based on environment variables
      initializeProviders: () => {
        const availableProviders = detectAvailableIntegrations()
        console.log("🔧 Detected integrations:", {
          total: availableProviders.length,
          available: availableProviders.filter((p) => p.isAvailable).length,
          unavailable: availableProviders.filter((p) => !p.isAvailable).length,
        })

        set({ providers: availableProviders, initialized: true })
      },

      // Fetch integrations with enhanced debugging
      fetchIntegrations: async (force = false) => {
        const { setLoading, lastFetch } = get()

        // Skip if recently fetched and not forced
        if (!force && lastFetch && Date.now() - lastFetch < 30000) {
          console.log("⏭️ Skipping fetch - recently fetched")
          return
        }

        setLoading("fetchIntegrations", true)

        try {
          console.log("🔄 Fetching integrations from API...")

          const response = await fetch("/api/integrations", {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include", // Important for session cookies
          })

          console.log("📡 API Response status:", response.status)

          if (!response.ok) {
            const errorText = await response.text()
            console.error("❌ API Error:", errorText)
            throw new Error(`API Error: ${response.status} - ${errorText}`)
          }

          const data = await response.json()
          console.log("📦 Raw API Response:", data)

          if (data.success && Array.isArray(data.data)) {
            const integrations = data.data
            console.log("✅ Integrations fetched successfully:", {
              count: integrations.length,
              integrations: integrations.map((i) => ({
                id: i.id,
                provider: i.provider,
                status: i.status,
                created_at: i.created_at,
              })),
            })

            set({
              integrations,
              error: null,
              lastFetch: Date.now(),
              debugInfo: {
                lastFetch: new Date().toISOString(),
                count: integrations.length,
                providers: integrations.map((i) => i.provider),
                statuses: integrations.reduce(
                  (acc, i) => {
                    acc[i.provider] = i.status
                    return acc
                  },
                  {} as Record<string, string>,
                ),
              },
            })
          } else {
            console.error("❌ Invalid API response format:", data)
            throw new Error(data.error || "Invalid response format from API")
          }
        } catch (error: any) {
          console.error("❌ Failed to fetch integrations:", error)
          set({
            error: error.message || "Failed to fetch integrations",
            debugInfo: {
              error: error.message,
              timestamp: new Date().toISOString(),
            },
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
          const response = await fetch("/api/integrations/oauth/generate-url", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              provider: providerId,
            }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || "Failed to generate OAuth URL")
          }

          const data = await response.json()

          if (data.success && data.authUrl) {
            // Open OAuth URL in new window
            const popup = window.open(data.authUrl, "_blank", "width=600,height=700,scrollbars=yes,resizable=yes")

            if (!popup) {
              throw new Error("Popup blocked. Please allow popups for this site to connect integrations.")
            }

            console.log(`✅ OAuth URL opened for ${providerId}`)
          } else {
            throw new Error(data.error || "Failed to generate OAuth URL")
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
          const response = await fetch(`/api/integrations/${integrationId}`, {
            method: "DELETE",
          })

          const data = await response.json()

          if (!response.ok || !data.success) {
            throw new Error(data.error || "Failed to disconnect integration")
          }

          // Update local state
          set((state) => ({
            integrations: state.integrations.map((i) =>
              i.id === integrationId ? { ...i, status: "disconnected" as const } : i,
            ),
          }))
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
          const response = await fetch(`/api/integrations/${integrationId}/refresh`, {
            method: "POST",
          })

          const data = await response.json()

          if (!response.ok || !data.success) {
            throw new Error(data.error || "Failed to refresh integration")
          }

          // Update the integration in the store
          set((state) => ({
            integrations: state.integrations.map((i) =>
              i.id === integrationId ? { ...i, last_sync: new Date().toISOString(), status: "connected" } : i,
            ),
          }))
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
          const response = await fetch("/api/integrations/refresh-all-tokens", {
            method: "POST",
          })

          const data = await response.json()

          if (!response.ok || !data.success) {
            throw new Error(data.error || "Failed to refresh tokens")
          }

          // Refresh integrations list after token refresh
          await get().fetchIntegrations(true)
          return data
        } catch (error: any) {
          console.error("Failed to refresh all tokens:", error)
          set({ error: error.message })
          throw error
        } finally {
          setLoading("refreshAllTokens", false)
        }
      },

      // Get dynamic data
      getDynamicData: (provider: string, dataType: string) => {
        const { dynamicData } = get()
        return dynamicData[provider]?.[dataType] || []
      },

      // Fetch dynamic data
      fetchDynamicData: async (provider: string, dataType: string) => {
        const { setLoading } = get()
        const key = `${provider}-${dataType}`
        setLoading(key, true)

        try {
          const response = await fetch("/api/integrations/fetch-user-data", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              provider,
              dataType,
            }),
          })

          const data = await response.json()

          if (response.ok && data.success && data.data) {
            set((state) => ({
              dynamicData: {
                ...state.dynamicData,
                [provider]: {
                  ...state.dynamicData[provider],
                  [dataType]: data.data,
                },
              },
            }))
          }
        } catch (error: any) {
          console.warn(`Failed to fetch ${provider} ${dataType}:`, error)
        } finally {
          setLoading(key, false)
        }
      },

      // Check if resource is loading
      isResourceLoading: (provider: string, dataType: string) => {
        const { loadingStates } = get()
        return loadingStates[`${provider}-${dataType}`] || false
      },

      // Ensure data is preloaded
      ensureDataPreloaded: async () => {
        const { preloadStarted, getConnectedProviders } = get()

        if (preloadStarted) {
          console.log("⏭️ Preload already started")
          return
        }

        try {
          set({ preloadStarted: true, globalPreloadingData: true })
          console.log("🚀 Starting data preload...")

          const connectedProviders = getConnectedProviders()

          if (connectedProviders.length > 0) {
            await get().startGlobalPreload(connectedProviders)
          }

          console.log("✅ Data preload completed")
        } catch (error) {
          console.error("❌ Data preload failed:", error)
        } finally {
          set({ globalPreloadingData: false })
        }
      },

      // Start global preload
      startGlobalPreload: async (connectedProviders: string[]) => {
        try {
          set({ globalPreloadingData: true })
          console.log("🌐 Starting global preload for providers:", connectedProviders)

          const progressCallback = (progress: { [key: string]: boolean }) => {
            set({ preloadProgress: progress })
          }

          await initializePreloadingForUser(connectedProviders, progressCallback)

          console.log("✅ Global preload completed")
        } catch (error) {
          console.error("❌ Global preload failed:", error)
        } finally {
          set({ globalPreloadingData: false })
        }
      },

      // Verify integration scopes
      verifyIntegrationScopes: async () => {
        const { integrations } = get()

        if (integrations.length === 0) {
          console.log("⏭️ No integrations to verify")
          return
        }

        try {
          set({ verifyingScopes: true })
          console.log("🔍 Verifying integration scopes...")

          // Get user ID from auth store
          const { useAuthStore } = await import("./authStore")
          const userId = useAuthStore.getState().getCurrentUserId()

          if (!userId) {
            throw new Error("User not authenticated")
          }

          const results = await validateAllIntegrations(userId)

          // Update integrations with validation results
          set((state) => ({
            integrations: state.integrations.map((integration) => {
              const result = results.find((r) => r.integrationId === integration.id)
              if (result) {
                return {
                  ...integration,
                  missing_scopes: result.missing,
                  granted_scopes: result.granted,
                  scope_validation_status: result.status,
                  last_scope_check: new Date().toISOString(),
                }
              }
              return integration
            }),
          }))

          console.log("✅ Scope verification completed")
        } catch (error) {
          console.error("❌ Scope verification failed:", error)
          set({ error: (error as Error).message })
        } finally {
          set({ verifyingScopes: false })
        }
      },

      // Validate provider scopes
      validateProviderScopes: async (provider: string) => {
        const { integrations } = get()
        const integration = integrations.find((i) => i.provider === provider)

        if (!integration) {
          console.log(`⏭️ No ${provider} integration found`)
          return
        }

        try {
          console.log(`🔍 Validating ${provider} scopes...`)

          const result = await validateAndUpdateIntegrationScopes(integration.id, integration.granted_scopes || [])

          // Update the integration with validation results
          set((state) => ({
            integrations: state.integrations.map((i) =>
              i.id === integration.id ? { ...i, ...result.integration } : i,
            ),
          }))

          console.log(`✅ ${provider} scope validation completed`)
        } catch (error) {
          console.error(`❌ ${provider} scope validation failed:`, error)
        }
      },

      // Get integration status by provider ID
      getIntegrationStatus: (providerId: string) => {
        const { integrations } = get()
        const integration = integrations.find((i) => i.provider === providerId)
        const status = integration?.status || "disconnected"
        console.log(`🔍 Status for ${providerId}:`, status, integration)
        return status
      },

      // Get connected providers
      getConnectedProviders: () => {
        const { integrations } = get()
        const connected = integrations.filter((i) => i.status === "connected").map((i) => i.provider)
        console.log("🔗 Connected providers:", connected)
        return connected
      },

      // Get integration by provider
      getIntegrationByProvider: (providerId: string) => {
        const { integrations } = get()
        const integration = integrations.find((i) => i.provider === providerId)
        console.log(`🔍 Integration for ${providerId}:`, integration)
        return integration || null
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

      setDebugInfo: (info: any) => set({ debugInfo: info }),

      clearAllData: () => {
        set({
          integrations: [],
          dynamicData: {},
          error: null,
          lastFetch: null,
          loadingStates: {},
          debugInfo: null,
          preloadStarted: false,
          globalPreloadingData: false,
          verifyingScopes: false,
          preloadProgress: {},
        })
      },
    }),
    {
      name: "chainreact-integrations",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        integrations: state.integrations,
        dynamicData: state.dynamicData,
        lastFetch: state.lastFetch,
        initialized: state.initialized,
        preloadStarted: state.preloadStarted,
      }),
    },
  ),
)
