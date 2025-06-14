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

  // Enhanced methods
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

  // New enhanced methods
  preloadResourcesForProvider: (provider: string) => Promise<void>
  getResourcesForTrigger: (provider: string, trigger: string) => CachedResource[]
  refreshResourcesForProvider: (provider: string) => Promise<void>
  isResourceLoading: (provider: string, dataType: string) => boolean
  getIntegrationStatus: (provider: string) => "connected" | "disconnected" | "error" | "not_found"
  getCachedResourceCount: (provider: string) => number
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
    capabilities: ["Create Events", "Read Events", "Manage Calendars", "Send Invites"],
    scopes: ["calendar", "calendar.events"],
    isAvailable: true,
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Upload files, manage folders, and share documents in Google Drive",
    category: "Storage",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GD",
    capabilities: ["File Upload", "File Management", "Sharing", "Folder Creation"],
    scopes: ["drive", "drive.file"],
    isAvailable: true,
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Manage records, create tables, and organize your data",
    category: "Database",
    logoUrl: "/placeholder.svg?height=40&width=40&text=A",
    capabilities: ["Records", "Tables", "Views", "Attachments"],
    scopes: ["data.records:read", "data.records:write"],
    isAvailable: true,
  },
  {
    id: "trello",
    name: "Trello",
    description: "Create cards, manage boards, and organize your projects",
    category: "Project Management",
    logoUrl: "/placeholder.svg?height=40&width=40&text=TR",
    capabilities: ["Boards", "Cards", "Lists", "Members"],
    scopes: ["read", "write"],
    isAvailable: true,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Manage repositories, issues, pull requests, and deployments",
    category: "Development",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GH",
    capabilities: ["Repositories", "Issues", "Pull Requests", "Actions"],
    scopes: ["repo", "user", "workflow"],
    isAvailable: true,
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Manage contacts, deals, companies, and marketing campaigns",
    category: "CRM",
    logoUrl: "/placeholder.svg?height=40&width=40&text=H",
    capabilities: ["Contacts", "Deals", "Companies", "Marketing"],
    scopes: ["crm.objects.contacts.read", "crm.objects.deals.read"],
    isAvailable: true,
  },
]

// Enhanced trigger-to-resource mapping
const TRIGGER_RESOURCE_MAPPING = {
  notion: {
    "Page Updated": ["pages"],
    "Database Item Added": ["databases"],
    "Database Item Updated": ["databases"],
    "New Page Created": ["pages"],
  },
  gmail: {
    "New Email": ["labels", "folders"],
    "Email Received from Specific Sender": ["contacts"],
    "Email with Attachment": ["labels"],
    "Important Email": ["labels"],
  },
  slack: {
    "New Message in Channel": ["channels"],
    "Direct Message Received": ["users"],
    "User Mentioned": ["channels"],
    "File Uploaded": ["channels"],
  },
  "google-sheets": {
    "New Row Added": ["spreadsheets"],
    "Row Updated": ["spreadsheets"],
    "Cell Changed": ["spreadsheets"],
  },
  "google-calendar": {
    "New Event": ["calendars"],
    "Event Updated": ["calendars"],
    "Event Starting Soon": ["calendars"],
  },
  airtable: {
    "New Record": ["bases"],
    "Record Updated": ["bases"],
  },
  trello: {
    "New Card": ["boards"],
    "Card Moved": ["boards"],
    "Card Updated": ["boards"],
  },
  github: {
    "New Issue": ["repositories"],
    "Pull Request Created": ["repositories"],
    "Push to Repository": ["repositories"],
  },
}

const timeoutPromise = (ms: number) => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
  })
}

const getAllDynamicDataTypes = () => {
  return [
    { provider: "notion", dataType: "pages" },
    { provider: "notion", dataType: "databases" },
    { provider: "slack", dataType: "channels" },
    { provider: "slack", dataType: "users" },
    { provider: "github", dataType: "repositories" },
    { provider: "google-sheets", dataType: "spreadsheets" },
    { provider: "google-calendar", dataType: "calendars" },
    { provider: "google-drive", dataType: "folders" },
    { provider: "airtable", dataType: "bases" },
    { provider: "trello", dataType: "boards" },
    { provider: "hubspot", dataType: "pipelines" },
  ]
}

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

      setHydrated: () => {
        set({ hydrated: true })
      },

      fetchIntegrations: async (forceRefresh = false) => {
        set({ loading: true, error: null })

        try {
          const {
            data: { user },
          } = await supabase.auth.getUser()

          if (!user) {
            console.log("No authenticated user found")
            set({
              integrations: [],
              loading: false,
              error: null,
              lastRefreshed: new Date().toISOString(),
            })
            return
          }

          console.log("🔄 Fetching integrations for user:", user.id)

          const fetchPromise = supabase
            .from("integrations")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })

          const result = await Promise.race([fetchPromise, timeoutPromise(10000)])
          const { data, error } = result as any

          if (error) {
            console.error("Supabase error:", error)
            throw new Error(error.message)
          }

          console.log("✅ Fetched integrations:", data?.length || 0)

          set({
            integrations: data || [],
            loading: false,
            error: null,
            lastRefreshed: new Date().toISOString(),
          })
        } catch (error: any) {
          console.error("Failed to fetch integrations:", error)
          set({
            loading: false,
            error: error.message || "Failed to fetch integrations",
            lastRefreshed: new Date().toISOString(),
          })
        }
      },

      verifyIntegrationScopes: async () => {
        set({ verifyingScopes: true })
        try {
          const response = await fetch("/api/integrations/verify-scopes")
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || "Failed to verify integration scopes")
          }
          const { integrations } = await response.json()
          if (integrations) {
            set({ integrations })
          }
        } catch (error: any) {
          console.error("Failed to verify integration scopes:", error)
          throw error
        } finally {
          set({ verifyingScopes: false })
        }
      },

      connectIntegration: async (providerId: string) => {
        try {
          console.log("Starting connection for provider:", providerId)

          const {
            data: { user },
          } = await supabase.auth.getUser()

          if (!user) {
            console.error("No authenticated user found")
            throw new Error("Authentication required. Please refresh the page and try again.")
          }

          const fetchPromise = fetch(`/api/integrations/auth/generate-url`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              provider: providerId,
              userId: user.id,
            }),
          })

          const response = (await Promise.race([fetchPromise, timeoutPromise(15000)])) as Response

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            if (response.status === 503) {
              throw new Error(errorData.error || `${providerId} integration is not configured. Please contact support.`)
            }
            throw new Error(errorData.error || "Failed to generate auth URL")
          }

          const { authUrl } = await response.json()
          window.location.href = authUrl
        } catch (error: any) {
          console.error("Failed to connect integration:", error)
          throw error
        }
      },

      disconnectIntegration: async (integrationId: string) => {
        try {
          if (!integrationId) {
            throw new Error("Integration ID is required")
          }

          const { error } = await supabase
            .from("integrations")
            .update({ status: "disconnected" })
            .eq("id", integrationId)

          if (error) {
            throw new Error(error.message)
          }

          await get().fetchIntegrations(true)
        } catch (error: any) {
          console.error("Failed to disconnect integration:", error)
          throw error
        }
      },

      refreshIntegration: async (providerId: string, integrationId?: string) => {
        try {
          if (!integrationId) {
            throw new Error("Integration ID is required")
          }

          const fetchPromise = fetch(`/api/integrations/refresh-token`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              integrationId,
            }),
          })

          const response = (await Promise.race([fetchPromise, timeoutPromise(10000)])) as Response

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || "Failed to refresh integration")
          }

          await get().fetchIntegrations(true)
        } catch (error: any) {
          console.error("Failed to refresh integration:", error)
          throw error
        }
      },

      refreshTokens: async () => {
        try {
          set({ refreshing: true })

          const fetchPromise = fetch("/api/integrations/refresh-tokens", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          })

          const response = (await Promise.race([fetchPromise, timeoutPromise(15000)])) as Response

          if (!response.ok) {
            await get().fetchIntegrations(true)
            set({
              refreshing: false,
              lastRefreshed: new Date().toISOString(),
            })

            return {
              success: true,
              message: "Integration data refreshed",
              refreshedCount: 0,
            }
          }

          const data = await response.json()
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
            message: error.message || "Failed to refresh",
            refreshedCount: 0,
          }
        }
      },

      handleOAuthSuccess: () => {
        if (typeof window !== "undefined") {
          const urlParams = new URLSearchParams(window.location.search)
          const success = urlParams.get("success")
          const provider = urlParams.get("provider")

          if (success && provider) {
            console.log(`OAuth success for ${provider}, refreshing integrations...`)
            setTimeout(() => {
              get().fetchIntegrations(true)
            }, 2000)

            const newUrl = window.location.pathname
            window.history.replaceState({}, "", newUrl)
          }
        }
      },

      initializeGlobalPreload: async () => {
        const state = get()
        if (state.preloadStarted || state.globalPreloadingData) {
          console.log("⚠️ Global preload already started or in progress")
          return
        }

        console.log("🚀 Starting enhanced global preload initialization...")
        set({ preloadStarted: true, globalPreloadingData: true })

        try {
          if (state.integrations.length === 0) {
            console.log("📡 Fetching integrations first...")
            await state.fetchIntegrations(true)
          }

          const updatedState = get()
          const connectedIntegrations = updatedState.integrations.filter((i) => i.status === "connected")

          if (connectedIntegrations.length === 0) {
            console.log("❌ No connected integrations found")
            set({ globalPreloadingData: false })
            return
          }

          console.log(`🔄 Preloading resources for ${connectedIntegrations.length} connected integrations`)

          // Preload resources for each connected provider
          for (const integration of connectedIntegrations) {
            await get().preloadResourcesForProvider(integration.provider)
          }

          console.log("🎉 Enhanced global preload completed successfully")
        } catch (error) {
          console.error("💥 Error during enhanced global preload:", error)
        } finally {
          set({ globalPreloadingData: false })
        }
      },

      preloadResourcesForProvider: async (provider: string) => {
        const allDataTypes = getAllDynamicDataTypes()
        const providerDataTypes = allDataTypes.filter((dt) => dt.provider === provider)

        console.log(`🔄 Preloading ${providerDataTypes.length} resource types for ${provider}`)

        for (const { dataType } of providerDataTypes) {
          try {
            await get().fetchDynamicData(provider, dataType)
            console.log(`✅ Preloaded ${provider}-${dataType}`)
          } catch (error) {
            console.error(`❌ Failed to preload ${provider}-${dataType}:`, error)
          }
        }
      },

      fetchDynamicData: async (provider: string, dataType: string) => {
        const cacheKey = `${provider}-${dataType}`
        const state = get()

        // Set loading state
        set((state) => ({
          resourceLoadingStates: { ...state.resourceLoadingStates, [cacheKey]: true },
        }))

        try {
          // Check if data is fresh (less than 10 minutes old)
          if (state.isDataFresh(provider, dataType)) {
            const cachedData = state.dynamicData[cacheKey] || []
            console.log(`💾 Using cached data for ${cacheKey}: ${cachedData.length} items`)
            return cachedData
          }

          console.log(`🌐 Fetching fresh data for ${cacheKey}`)

          const response = await fetch("/api/integrations/fetch-user-data", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ provider, dataType }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`❌ HTTP ${response.status} for ${cacheKey}:`, errorText)
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const result = await response.json()

          if (result.success) {
            const resources: CachedResource[] = (result.data || []).map((item: any) => ({
              id: item.id || item.value,
              name: item.name,
              value: item.value || item.id,
              type: dataType,
              metadata: item.metadata || {},
              lastUpdated: Date.now(),
            }))

            console.log(`✅ Successfully fetched ${resources.length} resources for ${cacheKey}`)

            // Store in cache with timestamp
            set((state) => ({
              dynamicData: { ...state.dynamicData, [cacheKey]: resources },
              dataLastFetched: { ...state.dataLastFetched, [cacheKey]: Date.now() },
            }))

            return resources
          } else {
            console.error(`❌ API error for ${cacheKey}:`, result.error)
            set((state) => ({
              dynamicData: { ...state.dynamicData, [cacheKey]: [] },
              dataLastFetched: { ...state.dataLastFetched, [cacheKey]: Date.now() },
            }))
            return []
          }
        } catch (error) {
          console.error(`💥 Network error fetching ${cacheKey}:`, error)
          set((state) => ({
            dynamicData: { ...state.dynamicData, [cacheKey]: [] },
            dataLastFetched: { ...state.dataLastFetched, [cacheKey]: Date.now() },
          }))
          return []
        } finally {
          // Clear loading state
          set((state) => ({
            resourceLoadingStates: { ...state.resourceLoadingStates, [cacheKey]: false },
          }))
        }
      },

      ensureDataPreloaded: async () => {
        const state = get()

        if (state.globalPreloadingData || state.preloadStarted) {
          console.log("⏳ Data preload already in progress or completed")
          return
        }

        console.log("🔄 Starting background data preload")
        await state.initializeGlobalPreload()
      },

      getDynamicData: (provider: string, dataType: string) => {
        const cacheKey = `${provider}-${dataType}`
        const data = get().dynamicData[cacheKey] || []
        return data
      },

      isDataFresh: (provider: string, dataType: string) => {
        const cacheKey = `${provider}-${dataType}`
        const state = get()
        const lastFetched = state.dataLastFetched[cacheKey]

        if (!lastFetched) return false

        const tenMinutesAgo = Date.now() - 10 * 60 * 1000
        return lastFetched > tenMinutesAgo
      },

      clearAllData: () => {
        console.log("🧹 Clearing all integration data")
        set({
          integrations: [],
          dynamicData: {},
          preloadProgress: {},
          preloadStarted: false,
          globalPreloadingData: false,
          dataLastFetched: {},
          lastRefreshed: null,
          resourceLoadingStates: {},
        })
      },

      // New enhanced methods
      getResourcesForTrigger: (provider: string, trigger: string) => {
        const mapping = TRIGGER_RESOURCE_MAPPING[provider as keyof typeof TRIGGER_RESOURCE_MAPPING]
        if (!mapping || !mapping[trigger as keyof typeof mapping]) {
          return []
        }

        const resourceTypes = mapping[trigger as keyof typeof mapping]
        const allResources: CachedResource[] = []

        resourceTypes.forEach((dataType) => {
          const resources = get().getDynamicData(provider, dataType)
          allResources.push(...resources)
        })

        return allResources
      },

      refreshResourcesForProvider: async (provider: string) => {
        console.log(`🔄 Refreshing all resources for ${provider}`)
        await get().preloadResourcesForProvider(provider)
      },

      isResourceLoading: (provider: string, dataType: string) => {
        const cacheKey = `${provider}-${dataType}`
        return get().resourceLoadingStates[cacheKey] || false
      },

      getIntegrationStatus: (provider: string) => {
        const integration = get().integrations.find((i) => i.provider === provider)
        return integration?.status || "not_found"
      },

      getCachedResourceCount: (provider: string) => {
        const allDataTypes = getAllDynamicDataTypes()
        const providerDataTypes = allDataTypes.filter((dt) => dt.provider === provider)

        let totalCount = 0
        providerDataTypes.forEach(({ dataType }) => {
          const resources = get().getDynamicData(provider, dataType)
          totalCount += resources.length
        })

        return totalCount
      },
    }),
    {
      name: "chainreact-integrations",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        integrations: state.integrations,
        dynamicData: state.dynamicData,
        dataLastFetched: state.dataLastFetched,
        lastRefreshed: state.lastRefreshed,
        preloadProgress: state.preloadProgress,
        preloadStarted: state.preloadStarted,
      }),
      onRehydrateStorage: () => (state) => {
        console.log(
          "🔄 Enhanced integration store rehydrated with",
          Object.keys(state?.dynamicData || {}).length,
          "cached resource types",
        )
        state?.setHydrated()
      },
    },
  ),
)
