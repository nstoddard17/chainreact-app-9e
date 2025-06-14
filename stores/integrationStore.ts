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
  connected?: boolean
  wasConnected?: boolean
  integration?: Integration
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

// Check if environment variables are available for each provider
const checkProviderAvailability = (providerId: string): boolean => {
  const envVarMap: Record<string, string[]> = {
    slack: ["NEXT_PUBLIC_SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
    discord: ["NEXT_PUBLIC_DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
    teams: ["NEXT_PUBLIC_TEAMS_CLIENT_ID", "TEAMS_CLIENT_SECRET"],
    gmail: ["NEXT_PUBLIC_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    "google-drive": ["NEXT_PUBLIC_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    "google-sheets": ["NEXT_PUBLIC_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    "google-docs": ["NEXT_PUBLIC_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    "google-calendar": ["NEXT_PUBLIC_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    youtube: ["NEXT_PUBLIC_YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
    github: ["NEXT_PUBLIC_GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
    gitlab: ["NEXT_PUBLIC_GITLAB_CLIENT_ID", "GITLAB_CLIENT_SECRET"],
    docker: ["NEXT_PUBLIC_DOCKER_CLIENT_ID", "DOCKER_CLIENT_SECRET"],
    twitter: ["NEXT_PUBLIC_TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET"],
    facebook: ["NEXT_PUBLIC_FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET"],
    instagram: ["NEXT_PUBLIC_INSTAGRAM_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET"],
    linkedin: ["NEXT_PUBLIC_LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    tiktok: ["NEXT_PUBLIC_TIKTOK_CLIENT_ID", "TIKTOK_CLIENT_SECRET"],
    notion: ["NEXT_PUBLIC_NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET"],
    trello: ["NEXT_PUBLIC_TRELLO_CLIENT_ID", "TRELLO_CLIENT_SECRET"],
    airtable: ["NEXT_PUBLIC_AIRTABLE_CLIENT_ID", "AIRTABLE_CLIENT_SECRET"],
    dropbox: ["NEXT_PUBLIC_DROPBOX_CLIENT_ID", "DROPBOX_CLIENT_SECRET"],
    onedrive: ["NEXT_PUBLIC_ONEDRIVE_CLIENT_ID", "ONEDRIVE_CLIENT_SECRET"],
    shopify: ["NEXT_PUBLIC_SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"],
    stripe: ["NEXT_PUBLIC_STRIPE_CLIENT_ID", "STRIPE_CLIENT_SECRET"],
    paypal: ["NEXT_PUBLIC_PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"],
    mailchimp: ["NEXT_PUBLIC_MAILCHIMP_CLIENT_ID", "MAILCHIMP_CLIENT_SECRET"],
    hubspot: ["NEXT_PUBLIC_HUBSPOT_CLIENT_ID", "HUBSPOT_CLIENT_SECRET"],
  }

  const requiredVars = envVarMap[providerId]
  if (!requiredVars) return false

  // Check if all required environment variables are present
  return requiredVars.every((varName) => {
    const value = process.env[varName]
    return value && value.trim() !== ""
  })
}

const availableProviders: Omit<Provider, "connected" | "wasConnected" | "integration">[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Connect your Slack workspace to receive notifications and updates.",
    category: "Communication",
    logoUrl: "/placeholder.svg?height=40&width=40&text=S",
    capabilities: ["Messaging", "Channels", "Files", "Users"],
    scopes: ["chat:write", "channels:read", "users:read"],
    isAvailable: checkProviderAvailability("slack"),
  },
  {
    id: "discord",
    name: "Discord",
    description: "Connect your Discord server to receive notifications and updates.",
    category: "Communication",
    logoUrl: "/placeholder.svg?height=40&width=40&text=D",
    capabilities: ["Messaging", "Voice", "Servers", "Users"],
    scopes: ["identify", "guilds"],
    isAvailable: checkProviderAvailability("discord"),
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Connect your Microsoft Teams workspace to receive notifications and updates.",
    category: "Communication",
    logoUrl: "/placeholder.svg?height=40&width=40&text=T",
    capabilities: ["Messaging", "Meetings", "Files", "Channels"],
    scopes: ["openid", "profile", "email"],
    isAvailable: checkProviderAvailability("teams"),
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Send emails, read messages, and manage your Gmail account",
    category: "Email",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GM",
    capabilities: ["Send Email", "Read Email", "Manage Labels", "Search"],
    scopes: ["email", "gmail.send", "gmail.modify"],
    isAvailable: checkProviderAvailability("gmail"),
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Connect your Google Drive account to access and manage files.",
    category: "Google Services",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GD",
    capabilities: ["File Storage", "File Sharing", "Collaboration"],
    scopes: ["drive"],
    isAvailable: checkProviderAvailability("google-drive"),
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Read and write data to Google Sheets spreadsheets",
    category: "Google Services",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GS",
    capabilities: ["Read Data", "Write Data", "Create Sheets", "Format Cells"],
    scopes: ["spreadsheets"],
    isAvailable: checkProviderAvailability("google-sheets"),
  },
  {
    id: "google-docs",
    name: "Google Docs",
    description: "Connect your Google Docs account to access and manage documents.",
    category: "Google Services",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GD",
    capabilities: ["Document Creation", "Editing", "Collaboration"],
    scopes: ["documents"],
    isAvailable: checkProviderAvailability("google-docs"),
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Create events, manage calendars, and schedule meetings",
    category: "Google Services",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GC",
    capabilities: ["Events", "Calendars", "Attendees", "Reminders"],
    scopes: ["calendar"],
    isAvailable: checkProviderAvailability("google-calendar"),
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Connect your YouTube channel to receive notifications and updates.",
    category: "Social Media",
    logoUrl: "/placeholder.svg?height=40&width=40&text=YT",
    capabilities: ["Video Upload", "Channel Management", "Analytics"],
    scopes: ["youtube.readonly", "youtube.upload"],
    isAvailable: checkProviderAvailability("youtube"),
  },
  {
    id: "github",
    name: "GitHub",
    description: "Manage repositories, issues, and collaborate on code",
    category: "Development",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GH",
    capabilities: ["Repositories", "Issues", "Pull Requests", "Commits"],
    scopes: ["repo", "user"],
    isAvailable: checkProviderAvailability("github"),
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Connect your GitLab account to access and manage repositories.",
    category: "Development",
    logoUrl: "/placeholder.svg?height=40&width=40&text=GL",
    capabilities: ["Repositories", "Issues", "Merge Requests", "CI/CD"],
    scopes: ["read_user", "read_api"],
    isAvailable: checkProviderAvailability("gitlab"),
  },
  {
    id: "docker",
    name: "Docker",
    description: "Connect your Docker account to access and manage containers.",
    category: "Development",
    logoUrl: "/placeholder.svg?height=40&width=40&text=DO",
    capabilities: ["Container Management", "Image Registry", "Deployment"],
    scopes: ["repo:read", "repo:write"],
    isAvailable: checkProviderAvailability("docker"),
  },
  {
    id: "twitter",
    name: "Twitter",
    description: "Connect your Twitter account to post and receive tweets.",
    category: "Social Media",
    logoUrl: "/placeholder.svg?height=40&width=40&text=TW",
    capabilities: ["Tweet", "Read Timeline", "Direct Messages"],
    scopes: ["tweet.read", "tweet.write"],
    isAvailable: checkProviderAvailability("twitter"),
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Connect your Facebook account to post and receive updates.",
    category: "Social Media",
    logoUrl: "/placeholder.svg?height=40&width=40&text=FB",
    capabilities: ["Post Updates", "Page Management", "Analytics"],
    scopes: ["public_profile", "pages_manage_posts"],
    isAvailable: checkProviderAvailability("facebook"),
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Connect your Instagram account to post and receive updates.",
    category: "Social Media",
    logoUrl: "/placeholder.svg?height=40&width=40&text=IG",
    capabilities: ["Post Photos", "Stories", "Analytics"],
    scopes: ["instagram_basic", "instagram_content_publish"],
    isAvailable: checkProviderAvailability("instagram"),
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Connect your LinkedIn account to post and receive updates.",
    category: "Social Media",
    logoUrl: "/placeholder.svg?height=40&width=40&text=LI",
    capabilities: ["Post Updates", "Profile Management", "Connections"],
    scopes: ["r_liteprofile", "w_member_social"],
    isAvailable: checkProviderAvailability("linkedin"),
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Connect your TikTok account to post and receive updates.",
    category: "Social Media",
    logoUrl: "/placeholder.svg?height=40&width=40&text=TT",
    capabilities: ["Video Upload", "Analytics", "User Info"],
    scopes: ["user.info.basic", "video.upload"],
    isAvailable: checkProviderAvailability("tiktok"),
  },
  {
    id: "notion",
    name: "Notion",
    description: "Create pages, manage databases, and organize your workspace",
    category: "Productivity",
    logoUrl: "/placeholder.svg?height=40&width=40&text=N",
    capabilities: ["Pages", "Databases", "Blocks", "Users"],
    scopes: ["read_content", "insert_content"],
    isAvailable: checkProviderAvailability("notion"),
  },
  {
    id: "trello",
    name: "Trello",
    description: "Manage boards, cards, and organize your projects",
    category: "Productivity",
    logoUrl: "/placeholder.svg?height=40&width=40&text=T",
    capabilities: ["Boards", "Cards", "Lists", "Members"],
    scopes: ["read", "write"],
    isAvailable: checkProviderAvailability("trello"),
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Manage records, bases, and collaborate on structured data",
    category: "Productivity",
    logoUrl: "/placeholder.svg?height=40&width=40&text=A",
    capabilities: ["Records", "Bases", "Tables", "Views"],
    scopes: ["data.records:read", "data.records:write"],
    isAvailable: checkProviderAvailability("airtable"),
  },
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Connect your Dropbox account to access and manage files.",
    category: "Storage",
    logoUrl: "/placeholder.svg?height=40&width=40&text=DB",
    capabilities: ["File Storage", "File Sharing", "Sync"],
    scopes: ["files.content.write", "files.content.read"],
    isAvailable: checkProviderAvailability("dropbox"),
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "Connect your OneDrive account to access and manage files.",
    category: "Storage",
    logoUrl: "/placeholder.svg?height=40&width=40&text=OD",
    capabilities: ["File Storage", "File Sharing", "Office Integration"],
    scopes: ["files.readwrite", "offline_access"],
    isAvailable: checkProviderAvailability("onedrive"),
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Connect your Shopify store to access and manage products.",
    category: "E-commerce",
    logoUrl: "/placeholder.svg?height=40&width=40&text=SH",
    capabilities: ["Product Management", "Order Processing", "Analytics"],
    scopes: ["read_products", "write_products"],
    isAvailable: checkProviderAvailability("shopify"),
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Connect your Stripe account to access and manage payments.",
    category: "Payments",
    logoUrl: "/placeholder.svg?height=40&width=40&text=ST",
    capabilities: ["Payment Processing", "Subscription Management", "Analytics"],
    scopes: ["read_write"],
    isAvailable: checkProviderAvailability("stripe"),
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Connect your PayPal account to access and manage payments.",
    category: "Payments",
    logoUrl: "/placeholder.svg?height=40&width=40&text=PP",
    capabilities: ["Payment Processing", "Transaction History", "Invoicing"],
    scopes: ["openid", "profile"],
    isAvailable: checkProviderAvailability("paypal"),
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Connect your Mailchimp account to access and manage campaigns.",
    category: "Marketing",
    logoUrl: "/placeholder.svg?height=40&width=40&text=MC",
    capabilities: ["Email Campaigns", "Audience Management", "Analytics"],
    scopes: ["basic_access"],
    isAvailable: checkProviderAvailability("mailchimp"),
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Connect your HubSpot account to access and manage contacts.",
    category: "CRM",
    logoUrl: "/placeholder.svg?height=40&width=40&text=HS",
    capabilities: ["Contact Management", "Deal Tracking", "Analytics"],
    scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"],
    isAvailable: checkProviderAvailability("hubspot"),
  },
]

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export const useIntegrationStore = create<IntegrationState>()(
  persist(
    (set, get) => ({
      integrations: [],
      providers: [],
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

          // Always set providers, even if no user
          const providersWithStatus = availableProviders.map((provider) => {
            const integration = user?.user
              ? (state.integrations || []).find((i) => i.provider === provider.id)
              : undefined

            return {
              ...provider,
              connected: integration?.status === "connected",
              wasConnected: !!integration && integration.status !== "connected",
              integration,
            }
          })

          if (!user.user) {
            set({
              integrations: [],
              providers: providersWithStatus,
              loading: false,
              lastRefreshed: new Date().toISOString(),
            })
            return
          }

          const { data, error } = await supabase
            .from("integrations")
            .select("*")
            .eq("user_id", user.user.id)
            .order("created_at", { ascending: false })

          if (error) {
            console.error("Supabase error:", error)
            set({
              integrations: [],
              providers: providersWithStatus,
              loading: false,
              lastRefreshed: new Date().toISOString(),
            })
            return
          }

          // Update providers with integration status
          const updatedProviders = availableProviders.map((provider) => {
            const integration = (data || []).find((i) => i.provider === provider.id)
            return {
              ...provider,
              connected: integration?.status === "connected",
              wasConnected: !!integration && integration.status !== "connected",
              integration,
            }
          })

          set({
            integrations: data || [],
            providers: updatedProviders,
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
            integrations: [],
            providers: availableProviders.map((p) => ({ ...p, connected: false, wasConnected: false })),
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
          const provider = availableProviders.find((p) => p.id === providerId)
          if (!provider?.isAvailable) {
            throw new Error(`${providerId} is not available. Please check the configuration.`)
          }

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
          const popup = window.open(result.authUrl, "_blank", "width=600,height=700")

          // Listen for the popup to close or for a message
          const checkClosed = setInterval(() => {
            if (popup?.closed) {
              clearInterval(checkClosed)
              // Refresh integrations after popup closes
              setTimeout(() => {
                get().fetchIntegrations(true)
              }, 1000)
            }
          }, 1000)
        } catch (error: any) {
          console.error("Failed to connect integration:", error)
          throw error
        }
      },

      disconnectIntegration: async (integrationId: string) => {
        try {
          const { data: session } = await supabase.auth.getSession()
          if (!session.session?.access_token) {
            throw new Error("No authentication token available")
          }

          const response = await fetch(`/api/integrations/${integrationId}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.session.access_token}`,
            },
          })

          const result = await response.json()

          if (!response.ok || !result.success) {
            throw new Error(result.error || "Failed to disconnect integration")
          }

          // Refresh integrations list
          await get().fetchIntegrations(true)

          // Clear cached data for this integration
          const integration = (get().integrations || []).find((i) => i.id === integrationId)
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
          const connectedIntegrations = (state.integrations || []).filter((i) => i.status === "connected")

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
          // Get auth token
          const { data: session } = await supabase.auth.getSession()
          if (!session.session?.access_token) {
            throw new Error("No authentication token available")
          }

          const response = await fetch("/api/integrations/fetch-user-data", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.session.access_token}`,
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
            value: item.value || item.id,
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
          throw error
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
        const state = get()
        const lastFetched = state.dataLastFetched[key]
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
          new_email: "labels",
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
        const integrations = get().integrations || []
        const integration = integrations.find((i) => i.provider === provider)
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
        integrations: state.integrations || [],
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
