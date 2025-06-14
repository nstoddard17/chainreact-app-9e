import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { supabase } from "@/lib/supabase"

interface Integration {
  id: string
  provider: string
  status: "connected" | "disconnected" | "error"
  user_id: string
  access_token?: string
  refresh_token?: string
  expires_at?: string
  created_at: string
  updated_at: string
  metadata?: any
  scopes?: string[]
}

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

interface CachedResource {
  id: string
  name: string
  value: string
  type?: string
  metadata?: any
  lastUpdated: number
}

interface IntegrationState {
  integrations: Integration[]
  providers: Provider[]
  loading: boolean
  verifyingScopes: boolean
  refreshing: boolean
  error: string | null
  lastRefreshed: string | null
  globalPreloadingData: boolean
  preloadProgress: { [key: string]: boolean }
  preloadStarted: boolean
  dynamicData: Record<string, CachedResource[]>
  dataLastFetched: Record<string, number>
  hydrated: boolean
  resourceLoadingStates: Record<string, boolean>

  // Core methods
  fetchIntegrations: (forceRefresh?: boolean) => Promise<void>
  verifyIntegrationScopes: () => Promise<void>
  connectIntegration: (providerId: string) => Promise<void>
  disconnectIntegration: (integrationId: string) => Promise<void>
  refreshIntegration: (providerId: string, integrationId?: string) => Promise<void>
  refreshTokens: () => Promise<{
    success: boolean
    message: string
    refreshedCount: number
  }>
  handleOAuthSuccess: () => void
  initializeGlobalPreload: () => Promise<void>
  fetchDynamicData: (provider: string, dataType: string) => Promise<CachedResource[]>
  ensureDataPreloaded: () => Promise<void>
  getDynamicData: (provider: string, dataType: string) => CachedResource[]
  isDataFresh: (provider: string, dataType: string) => boolean
  clearAllData: () => void
  setHydrated: () => void

  // Enhanced methods for streamlined workflow
  preloadResourcesForProvider: (provider: string) => Promise<void>
  getResourcesForTrigger: (provider: string, trigger: string) => CachedResource[]
  refreshResourcesForProvider: (provider: string) => Promise<void>
  isResourceLoading: (provider: string, dataType: string) => boolean
  getIntegrationStatus: (provider: string) => "connected" | "disconnected" | "error" | "not_found"
  getCachedResourceCount: (provider: string) => number
  preloadUserDataOnLogin: () => Promise<void>
}

const availableProviders: Provider[] = [
  {
    id: "notion",
    name: "Notion",
    description: "Create pages, manage databases, and organize your workspace",
    category: "Productivity",
    logoUrl: "/placeholder.svg?height=40&width=40&text=N",
    capabilities: ["Pages", "Databases", "Blocks", "Users"],
    scopes: ["read_content", "insert_content"],
    isAvailable: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Send emails, read messages, and manage your Gmail account",
    category: "Email",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GM",
    capabilities: ["Send Email", "Read Email", "Manage Labels", "Search"],
    scopes: ["email", "gmail.send", "gmail.modify"],
    isAvailable: true,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send messages, create channels, and manage your Slack workspace",
    category: "Communication",
    logoUrl: "/placeholder.svg?height=40&width=40&text=S",
    capabilities: ["Messaging", "Channels", "Files", "Users"],
    scopes: ["chat:write", "channels:read", "users:read"],
    isAvailable: true,
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Read and write data to Google Sheets spreadsheets",
    category: "Productivity",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GS",
    capabilities: ["Read Data", "Write Data", "Create Sheets", "Format Cells"],
    scopes: ["spreadsheets"],
    isAvailable: true,
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Create events, manage calendars, and schedule meetings",
    category: "Productivity",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GC",
    capabilities: ["Events", "Calendars", "Attendees", "Reminders"],
    scopes: ["calendar"],
    isAvailable: true,
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Manage records, bases, and collaborate on structured data",
    category: "Database",
    logoUrl: "/placeholder.svg?height=40&width=40&text=A",
    capabilities: ["Records", "Bases", "Tables", "Views"],
    scopes: ["data.records:read", "data.records:write"],
    isAvailable: true,
  },
  {
    id: "trello",
    name: "Trello",
    description: "Manage boards, cards, and organize your projects",
    category: "Project Management",
    logoUrl: "/placeholder.svg?height=40&width=40&text=T",
    capabilities: ["Boards", "Cards", "Lists", "Members"],
    scopes: ["read", "write"],
    isAvailable: true,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Manage repositories, issues, and collaborate on code",
    category: "Development",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GH",
    capabilities: ["Repositories", "Issues", "Pull Requests", "Commits"],
    scopes: ["repo", "user"],
    isAvailable: true,
  },
]

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export const useIntegrationStore = create<IntegrationState>()(
  persist(
    (set, get) => ({
      integrations: [],
      providers: availableProviders,
      loading: false,
      verifyingScopes: false,
      refreshing: false,
      error: null,
      lastRefreshed: null,
      globalPreloadingData: false,
      preloadProgress: {},
      preloadStarted: false,
      dynamicData: {},
      dataLastFetched: {},
      hydrated: false,
      resourceLoadingStates: {},

      setHydrated: () => set({ hydrated: true }),

      fetchIntegrations: async (forceRefresh = false) => {
        const state = get()
        if (state.loading && !forceRefresh) return

        set({ loading: true, error: null })

        try {
          const { data: user } = await supabase.auth.getUser()
          if (!user.user) {
            throw new Error("User not authenticated")
          }

          const { data, error } = await supabase
            .from("integrations")
            .select("*")
            .eq("user_id", user.user.id)
            .order("created_at", { ascending: false })

          if (error) throw error

          set({
            integrations: data || [],
            loading: false,
            lastRefreshed: new Date().toISOString(),
          })

          // Start preloading if we have connected integrations
          const connectedIntegrations = (data || []).filter((i) => i.status === "connected")
          if (connectedIntegrations.length > 0 && !state.preloadStarted) {
            get().initializeGlobalPreload()
          }
        } catch (error: any) {
          console.error("Failed to fetch integrations:", error)
          set({
            error: error.message || "Failed to fetch integrations",
            loading: false,
          })
        }
      },

      verifyIntegrationScopes: async () => {
        set({ verifyingScopes: true, error: null })

        try {
          const response = await fetch("/api/integrations/verify-scopes", {
            method: "POST",
          })

          const result = await response.json()

          if (!result.success) {
            throw new Error(result.error || "Failed to verify scopes")
          }

          // Refresh integrations to get updated status
          await get().fetchIntegrations(true)
        } catch (error: any) {
          console.error("Failed to verify scopes:", error)
          set({ error: error.message || "Failed to verify scopes" })
        } finally {
          set({ verifyingScopes: false })
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

          const result = await response.json()

          if (!result.success) {
            throw new Error(result.error || "Failed to generate auth URL")
          }

          // Open in new tab
          window.open(result.authUrl, "_blank", "width=600,height=700")
        } catch (error: any) {
          console.error("Failed to connect integration:", error)
          throw error
        }
      },

      disconnectIntegration: async (integrationId: string) => {
        try {
          const response = await fetch(`/api/integrations/${integrationId}`, {
            method: "DELETE",
          })

          if (!response.ok) {
            throw new Error("Failed to disconnect integration")
          }

          // Remove from local state
          set((state) => ({
            integrations: state.integrations.filter((i) => i.id !== integrationId),
          }))

          // Clear cached data for this integration
          const integration = get().integrations.find((i) => i.id === integrationId)
          if (integration) {
            set((state) => {
              const newDynamicData = { ...state.dynamicData }
              Object.keys(newDynamicData).forEach((key) => {
                if (key.startsWith(integration.provider)) {
                  delete newDynamicData[key]
                }
              })
              return { dynamicData: newDynamicData }
            })
          }
        } catch (error: any) {
          console.error("Failed to disconnect integration:", error)
          throw error
        }
      },

      refreshIntegration: async (providerId: string, integrationId?: string) => {
        set({ refreshing: true, error: null })

        try {
          const response = await fetch("/api/integrations/oauth/refresh", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              provider: providerId,
              integrationId,
            }),
          })

          const result = await response.json()

          if (!result.success) {
            throw new Error(result.error || "Failed to refresh integration")
          }

          // Refresh integrations list
          await get().fetchIntegrations(true)
        } catch (error: any) {
          console.error("Failed to refresh integration:", error)
          set({ error: error.message || "Failed to refresh integration" })
        } finally {
          set({ refreshing: false })
        }
      },

      refreshTokens: async () => {
        set({ refreshing: true, error: null })

        try {
          const response = await fetch("/api/integrations/refresh-tokens", {
            method: "POST",
          })

          const result = await response.json()

          if (!result.success) {
            throw new Error(result.error || "Failed to refresh tokens")
          }

          // Refresh integrations list
          await get().fetchIntegrations(true)

          return {
            success: true,
            message: result.message || "Tokens refreshed successfully",
            refreshedCount: result.refreshedCount || 0,
          }
        } catch (error: any) {
          console.error("Failed to refresh tokens:", error)
          set({ error: error.message || "Failed to refresh tokens" })
          return {
            success: false,
            message: error.message || "Failed to refresh tokens",
            refreshedCount: 0,
          }
        } finally {
          set({ refreshing: false })
        }
      },

      handleOAuthSuccess: () => {
        // Refresh integrations after successful OAuth
        get().fetchIntegrations(true)
      },

      initializeGlobalPreload: async () => {
        const state = get()
        if (state.globalPreloadingData || state.preloadStarted) return

        set({ globalPreloadingData: true, preloadStarted: true, preloadProgress: {} })

        try {
          const connectedIntegrations = state.integrations.filter((i) => i.status === "connected")

          for (const integration of connectedIntegrations) {
            await get().preloadResourcesForProvider(integration.provider)
          }
        } catch (error) {
          console.error("Failed to initialize global preload:", error)
        } finally {
          set({ globalPreloadingData: false })
        }
      },

      preloadResourcesForProvider: async (provider: string) => {
        const resourceTypes = getResourceTypesForProvider(provider)

        set((state) => ({
          preloadProgress: {
            ...state.preloadProgress,
            [provider]: false,
          },
        }))

        try {
          for (const resourceType of resourceTypes) {
            await get().fetchDynamicData(provider, resourceType)
          }

          set((state) => ({
            preloadProgress: {
              ...state.preloadProgress,
              [provider]: true,
            },
          }))
        } catch (error) {
          console.error(`Failed to preload resources for ${provider}:`, error)
        }
      },

      fetchDynamicData: async (provider: string, dataType: string) => {
        const key = `${provider}_${dataType}`
        const state = get()

        // Check if data is fresh
        if (state.isDataFresh(provider, dataType)) {
          return state.dynamicData[key] || []
        }

        // Set loading state
        set((state) => ({
          resourceLoadingStates: {
            ...state.resourceLoadingStates,
            [key]: true,
          },
        }))

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

          const result = await response.json()

          if (!result.success) {
            throw new Error(result.error || `Failed to fetch ${dataType} for ${provider}`)
          }

          const resources: CachedResource[] = (result.data || []).map((item: any) => ({
            id: item.id,
            name: item.name || item.title || item.summary || "Untitled",
            value: item.id,
            type: dataType,
            metadata: item,
            lastUpdated: Date.now(),
          }))

          set((state) => ({
            dynamicData: {
              ...state.dynamicData,
              [key]: resources,
            },
            dataLastFetched: {
              ...state.dataLastFetched,
              [key]: Date.now(),
            },
          }))

          return resources
        } catch (error: any) {
          console.error(`Failed to fetch ${dataType} for ${provider}:`, error)
          return []
        } finally {
          // Clear loading state
          set((state) => ({
            resourceLoadingStates: {
              ...state.resourceLoadingStates,
              [key]: false,
            },
          }))
        }
      },

      ensureDataPreloaded: async () => {
        const state = get()
        if (!state.preloadStarted) {
          await get().initializeGlobalPreload()
        }
      },

      getDynamicData: (provider: string, dataType: string) => {
        const key = `${provider}_${dataType}`
        return get().dynamicData[key] || []
      },

      isDataFresh: (provider: string, dataType: string) => {
        const key = `${provider}_${dataType}`
        const lastFetched = get().dataLastFetched[key]
        return lastFetched && Date.now() - lastFetched < CACHE_DURATION
      },

      clearAllData: () => {
        set({
          dynamicData: {},
          dataLastFetched: {},
          preloadProgress: {},
          preloadStarted: false,
          globalPreloadingData: false,
          resourceLoadingStates: {},
        })
      },

      getResourcesForTrigger: (provider: string, trigger: string) => {
        // Map triggers to resource types
        const triggerResourceMap: Record<string, string> = {
          page_updated: "pages",
          database_item_added: "databases",
          database_item_updated: "databases",
          new_message_in_channel: "channels",
          direct_message_received: "users",
          new_row_added: "spreadsheets",
          new_event: "calendars",
          new_record: "bases",
          new_card: "boards",
          new_issue: "repositories",
        }

        const resourceType = triggerResourceMap[trigger]
        if (!resourceType) return []

        return get().getDynamicData(provider, resourceType)
      },

      refreshResourcesForProvider: async (provider: string) => {
        const resourceTypes = getResourceTypesForProvider(provider)

        // Clear existing data
        set((state) => {
          const newDynamicData = { ...state.dynamicData }
          const newDataLastFetched = { ...state.dataLastFetched }

          resourceTypes.forEach((resourceType) => {
            const key = `${provider}_${resourceType}`
            delete newDynamicData[key]
            delete newDataLastFetched[key]
          })

          return {
            dynamicData: newDynamicData,
            dataLastFetched: newDataLastFetched,
          }
        })

        // Fetch fresh data
        for (const resourceType of resourceTypes) {
          await get().fetchDynamicData(provider, resourceType)
        }
      },

      isResourceLoading: (provider: string, dataType: string) => {
        const key = `${provider}_${dataType}`
        return get().resourceLoadingStates[key] || false
      },

      getIntegrationStatus: (provider: string) => {
        const integration = get().integrations.find((i) => i.provider === provider)
        if (!integration) return "not_found"
        return integration.status
      },

      getCachedResourceCount: (provider: string) => {
        const resourceTypes = getResourceTypesForProvider(provider)
        let totalCount = 0

        resourceTypes.forEach((resourceType) => {
          const resources = get().getDynamicData(provider, resourceType)
          totalCount += resources.length
        })

        return totalCount
      },

      preloadUserDataOnLogin: async () => {
        // This method is called when user logs in to start background preloading
        await get().fetchIntegrations()
        await get().initializeGlobalPreload()
      },
    }),
    {
      name: "integration-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        integrations: state.integrations,
        dynamicData: state.dynamicData,
        dataLastFetched: state.dataLastFetched,
        preloadProgress: state.preloadProgress,
        preloadStarted: state.preloadStarted,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated()
      },
    },
  ),
)

// Helper function to get resource types for each provider
function getResourceTypesForProvider(provider: string): string[] {
  const resourceMap: Record<string, string[]> = {
    notion: ["pages", "databases"],
    slack: ["channels", "users"],
    "google-sheets": ["spreadsheets"],
    "google-calendar": ["calendars"],
    airtable: ["bases"],
    trello: ["boards"],
    github: ["repositories"],
    gmail: ["labels"],
  }

  return resourceMap[provider] || []
}
