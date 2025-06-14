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
  dynamicData: Record<string, any[]>
  dataLastFetched: Record<string, number>
  hydrated: boolean
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
  fetchDynamicData: (provider: string, dataType: string) => Promise<any>
  ensureDataPreloaded: () => Promise<void>
  getDynamicData: (provider: string, dataType: string) => any[]
  isDataFresh: (provider: string, dataType: string) => boolean
  clearAllData: () => void
  setHydrated: () => void
}

const availableProviders: Provider[] = [
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
    id: "google-docs",
    name: "Google Docs",
    description: "Create, edit, and collaborate on documents",
    category: "Productivity",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GD",
    capabilities: ["Create Documents", "Edit Content", "Share Documents", "Comments"],
    scopes: ["documents"],
    isAvailable: true,
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Upload videos, manage channels, and access analytics",
    category: "Media",
    logoUrl: "/placeholder.svg?height=40&width=40&text=YT",
    capabilities: ["Upload Videos", "Manage Channel", "Read Analytics", "Manage Playlists"],
    scopes: ["youtube.upload", "youtube.readonly"],
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
    id: "discord",
    name: "Discord",
    description: "Send messages, manage servers, and interact with Discord communities",
    category: "Communication",
    logoUrl: "/placeholder.svg?height=40&width=40&text=D",
    capabilities: ["Messaging", "Servers", "Channels", "Webhooks"],
    scopes: ["bot", "identify", "guilds"],
    isAvailable: true,
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Send messages, schedule meetings, and collaborate with your team",
    category: "Productivity",
    logoUrl: "/placeholder.svg?height=40&width=40&text=T",
    capabilities: ["Messaging", "Meetings", "Files", "Channels"],
    scopes: ["Chat.ReadWrite", "Team.ReadBasic.All"],
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
    id: "dropbox",
    name: "Dropbox",
    description: "Upload files, manage folders, and share content",
    category: "Storage",
    logoUrl: "/placeholder.svg?height=40&width=40&text=DB",
    capabilities: ["Files", "Folders", "Sharing", "Metadata"],
    scopes: ["files.content.write", "files.content.read"],
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
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Share posts, manage connections, and access professional data",
    category: "Social",
    logoUrl: "/placeholder.svg?height=40&width=40&text=LI",
    capabilities: ["Posts", "Connections", "Profile", "Companies"],
    scopes: ["r_liteprofile", "w_member_social"],
    isAvailable: true,
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Post content, manage pages, and access social insights",
    category: "Social",
    logoUrl: "/placeholder.svg?height=40&width=40&text=F",
    capabilities: ["Posts", "Pages", "Insights", "Events"],
    scopes: ["public_profile", "email", "pages_show_list", "pages_manage_posts", "pages_read_engagement"],
    isAvailable: true,
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Post photos, manage content, and access media insights",
    category: "Social",
    logoUrl: "/placeholder.svg?height=40&width=40&text=IG",
    capabilities: ["Posts", "Stories", "Media", "Insights"],
    scopes: ["instagram_basic", "instagram_content_publish"],
    isAvailable: true,
  },
  {
    id: "twitter",
    name: "X",
    description: "Post tweets, manage followers, and access social data",
    category: "Social",
    logoUrl: "/placeholder.svg?height=40&width=40&text=X",
    capabilities: ["Tweets", "Followers", "Direct Messages", "Analytics"],
    scopes: ["tweet.read", "tweet.write", "users.read"],
    isAvailable: true,
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Post videos, manage content, and access creator tools",
    category: "Social",
    logoUrl: "/placeholder.svg?height=40&width=40&text=TT",
    capabilities: ["Videos", "Analytics", "User Info"],
    scopes: ["user.info.basic", "video.upload"],
    isAvailable: true,
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Manage email campaigns, lists, and marketing automation",
    category: "Marketing",
    logoUrl: "/placeholder.svg?height=40&width=40&text=MC",
    capabilities: ["Campaigns", "Lists", "Automation", "Reports"],
    scopes: ["read", "write"],
    isAvailable: true,
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Manage products, orders, customers, and store data",
    category: "E-commerce",
    logoUrl: "/placeholder.svg?height=40&width=40&text=SH",
    capabilities: ["Products", "Orders", "Customers", "Inventory"],
    scopes: ["read_products", "write_products", "read_orders"],
    isAvailable: true,
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Process payments, manage customers, and handle subscriptions",
    category: "Payments",
    logoUrl: "/placeholder.svg?height=40&width=40&text=ST",
    capabilities: ["Payments", "Customers", "Subscriptions", "Invoices"],
    scopes: ["read_write"],
    isAvailable: true,
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Process payments, manage transactions, and handle disputes",
    category: "Payments",
    logoUrl: "/placeholder.svg?height=40&width=40&text=PP",
    capabilities: ["Payments", "Transactions", "Disputes", "Invoices"],
    scopes: ["openid", "profile", "email"],
    isAvailable: true,
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Manage repositories, issues, merge requests, and CI/CD pipelines",
    category: "Development",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GL",
    capabilities: ["Repositories", "Issues", "Merge Requests", "Pipelines"],
    scopes: ["api", "read_user", "read_repository"],
    isAvailable: true,
  },
  {
    id: "docker",
    name: "Docker Hub",
    description: "Manage container images, repositories, and deployments",
    category: "Development",
    logoUrl: "/placeholder.svg?height=40&width=40&text=DH",
    capabilities: ["Images", "Repositories", "Tags", "Webhooks"],
    scopes: ["repo:read", "repo:write"],
    isAvailable: false,
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "Upload files, manage folders, and share documents",
    category: "Storage",
    logoUrl: "/placeholder.svg?height=40&width=40&text=OD",
    capabilities: ["Files", "Folders", "Sharing", "Sync"],
    scopes: ["Files.ReadWrite", "Files.ReadWrite.All"],
    isAvailable: true,
  },
]

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
    { provider: "discord", dataType: "channels" },
    { provider: "teams", dataType: "teams" },
    { provider: "trello", dataType: "boards" },
    { provider: "airtable", dataType: "bases" },
    { provider: "hubspot", dataType: "pipelines" },
    { provider: "mailchimp", dataType: "lists" },
    { provider: "google-sheets", dataType: "spreadsheets" },
    { provider: "google-calendar", dataType: "calendars" },
    { provider: "google-drive", dataType: "folders" },
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

          console.log("Fetching integrations for user:", user.id)

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

          console.log("Fetched integrations:", data?.length || 0)

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

          console.log("Making API call to generate auth URL")

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

          console.log("API response status:", response.status)

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            console.error("API error:", errorData)

            if (response.status === 503) {
              throw new Error(errorData.error || `${providerId} integration is not configured. Please contact support.`)
            }

            throw new Error(errorData.error || "Failed to generate auth URL")
          }

          const { authUrl } = await response.json()
          console.log("Generated auth URL, redirecting...")

          if (providerId === "teams") {
            const url = new URL(authUrl)
            url.searchParams.append("_t", Date.now().toString())
            window.location.href = url.toString()
          } else {
            window.location.href = authUrl
          }
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
            console.log("Token refresh endpoint not available, just refreshing data")
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

          try {
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
          } catch (fallbackError: any) {
            set({ refreshing: false })
            return {
              success: false,
              message: fallbackError.message || "Failed to refresh",
              refreshedCount: 0,
            }
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
          console.log("Global preload already started or in progress")
          return
        }

        console.log("🚀 Starting global preload initialization...")
        set({ preloadStarted: true, globalPreloadingData: true })

        try {
          // First fetch integrations if not already loaded
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

          const allDataTypes = getAllDynamicDataTypes()
          const connectedProviders = connectedIntegrations.map((i) => i.provider)
          const relevantDataTypes = allDataTypes.filter((dt) => connectedProviders.includes(dt.provider))

          console.log(
            `📊 Starting background preload for ${relevantDataTypes.length} data types across ${connectedProviders.length} providers:`,
            connectedProviders,
          )

          const initialProgress: { [key: string]: boolean } = {}
          relevantDataTypes.forEach(({ provider, dataType }) => {
            initialProgress[`${provider}-${dataType}`] = false
          })
          set({ preloadProgress: initialProgress })

          // Fetch all data types with controlled concurrency
          const batchSize = 3
          for (let i = 0; i < relevantDataTypes.length; i += batchSize) {
            const batch = relevantDataTypes.slice(i, i + batchSize)

            await Promise.allSettled(
              batch.map(async ({ provider, dataType }) => {
                try {
                  console.log(`🔄 Fetching data for ${provider}-${dataType}`)
                  const data = await get().fetchDynamicData(provider, dataType)
                  console.log(`✅ Successfully fetched ${data.length} items for ${provider}-${dataType}`)

                  set((state) => ({
                    preloadProgress: {
                      ...state.preloadProgress,
                      [`${provider}-${dataType}`]: true,
                    },
                  }))
                } catch (error) {
                  console.error(`❌ Failed to preload ${provider}-${dataType}:`, error)
                  set((state) => ({
                    preloadProgress: {
                      ...state.preloadProgress,
                      [`${provider}-${dataType}`]: true,
                    },
                  }))
                }
              }),
            )

            if (i + batchSize < relevantDataTypes.length) {
              await new Promise((resolve) => setTimeout(resolve, 1000))
            }
          }

          console.log("🎉 Background preload completed successfully")
        } catch (error) {
          console.error("💥 Error during background preload:", error)
        } finally {
          set({ globalPreloadingData: false })
        }
      },

      fetchDynamicData: async (provider: string, dataType: string) => {
        const cacheKey = `${provider}-${dataType}`
        const state = get()

        // Check if data is fresh (less than 10 minutes old)
        if (state.isDataFresh(provider, dataType)) {
          const cachedData = state.dynamicData[cacheKey] || []
          console.log(`💾 Using cached data for ${cacheKey}: ${cachedData.length} items`)
          return cachedData
        }

        try {
          console.log(`🌐 Fetching fresh data for ${cacheKey}`)

          const response = await fetch("/api/integrations/fetch-user-data", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ provider, dataType }),
          })

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const result = await response.json()

          if (result.success) {
            const options = result.data || []
            console.log(`✅ Successfully fetched ${options.length} items for ${cacheKey}`)

            // Store in cache with timestamp
            set((state) => ({
              dynamicData: { ...state.dynamicData, [cacheKey]: options },
              dataLastFetched: { ...state.dataLastFetched, [cacheKey]: Date.now() },
            }))

            return options
          } else {
            console.error(`❌ API error for ${cacheKey}:`, result.error)
            // Store empty array to prevent repeated failed requests
            set((state) => ({
              dynamicData: { ...state.dynamicData, [cacheKey]: [] },
              dataLastFetched: { ...state.dataLastFetched, [cacheKey]: Date.now() },
            }))
            return []
          }
        } catch (error) {
          console.error(`💥 Network error fetching ${cacheKey}:`, error)
          // Store empty array to prevent repeated failed requests
          set((state) => ({
            dynamicData: { ...state.dynamicData, [cacheKey]: [] },
            dataLastFetched: { ...state.dataLastFetched, [cacheKey]: Date.now() },
          }))
          return []
        }
      },

      ensureDataPreloaded: async () => {
        const state = get()

        if (state.globalPreloadingData || state.preloadStarted) {
          console.log("⏳ Data preload already in progress or completed")
          return
        }

        if (state.lastRefreshed) {
          const lastRefresh = new Date(state.lastRefreshed)
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
          if (lastRefresh > tenMinutesAgo && state.integrations.length > 0) {
            console.log("✅ Data is recent, skipping preload")
            return
          }
        }

        console.log("🔄 Starting background data preload")
        await state.initializeGlobalPreload()
      },

      getDynamicData: (provider: string, dataType: string) => {
        const cacheKey = `${provider}-${dataType}`
        const data = get().dynamicData[cacheKey] || []
        console.log(`📋 Getting cached data for ${cacheKey}: ${data.length} items`)
        return data
      },

      isDataFresh: (provider: string, dataType: string) => {
        const cacheKey = `${provider}-${dataType}`
        const state = get()
        const lastFetched = state.dataLastFetched[cacheKey]

        if (!lastFetched) {
          console.log(`❓ No cache timestamp for ${cacheKey}`)
          return false
        }

        const tenMinutesAgo = Date.now() - 10 * 60 * 1000
        const isFresh = lastFetched > tenMinutesAgo
        console.log(
          `🕒 Data freshness check for ${cacheKey}: ${isFresh ? "fresh" : "stale"} (${Math.round((Date.now() - lastFetched) / 1000 / 60)} minutes old)`,
        )
        return isFresh
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
        })
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
          "🔄 Integration store rehydrated with",
          Object.keys(state?.dynamicData || {}).length,
          "cached data types",
        )
        state?.setHydrated()
      },
    },
  ),
)
