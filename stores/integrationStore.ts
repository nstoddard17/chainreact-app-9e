import { create } from "zustand"
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
    isAvailable: false, // Set to false to show "Coming Soon"
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

// Helper function to create a promise that rejects after a timeout
const timeoutPromise = (ms: number) => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
  })
}

const getAllDynamicDataTypes = () => {
  return [
    { provider: "gmail", dataType: "emails" },
    { provider: "google-drive", dataType: "files" },
    { provider: "google-calendar", dataType: "events" },
    { provider: "slack", dataType: "messages" },
    { provider: "github", dataType: "repositories" },
    { provider: "discord", dataType: "channels" },
    { provider: "teams", dataType: "meetings" },
    { provider: "trello", dataType: "boards" },
    { provider: "notion", dataType: "pages" },
    { provider: "airtable", dataType: "records" },
    { provider: "dropbox", dataType: "files" },
    { provider: "hubspot", dataType: "contacts" },
    { provider: "linkedin", dataType: "posts" },
    { provider: "facebook", dataType: "posts" },
    { provider: "instagram", dataType: "posts" },
    { provider: "twitter", dataType: "tweets" },
    { provider: "tiktok", dataType: "videos" },
    { provider: "mailchimp", dataType: "campaigns" },
    { provider: "shopify", dataType: "products" },
    { provider: "stripe", dataType: "payments" },
    { provider: "paypal", dataType: "transactions" },
    { provider: "gitlab", dataType: "projects" },
    { provider: "onedrive", dataType: "files" },
  ]
}

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
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

      // Use Promise.race to implement a timeout
      const fetchPromise = supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      const result = await Promise.race([
        fetchPromise,
        timeoutPromise(10000), // 10 second timeout
      ])

      const { data, error } = result as any

      if (error) {
        console.error("Supabase error:", error)
        throw new Error(error.message)
      }

      console.log("Fetched integrations:", data?.length || 0)
      console.log(
        "Integration details:",
        data?.map((i: any) => ({
          id: i.id,
          provider: i.provider,
          status: i.status,
          created_at: i.created_at,
        })),
      )

      // Debug: Check specifically for YouTube
      const youtubeIntegration = data?.find((i: any) => i.provider === "youtube")
      if (youtubeIntegration) {
        console.log("Found YouTube integration:", {
          id: youtubeIntegration.id,
          provider: youtubeIntegration.provider,
          status: youtubeIntegration.status,
          created_at: youtubeIntegration.created_at,
          updated_at: youtubeIntegration.updated_at,
          hasAccessToken: !!youtubeIntegration.access_token,
          metadata: youtubeIntegration.metadata,
        })
      } else {
        console.log("No YouTube integration found in database")
      }

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
      // Don't clear integrations on error to prevent UI flashing
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

      console.log("User check:", {
        hasUser: !!user,
        userId: user?.id,
      })

      if (!user) {
        console.error("No authenticated user found")
        throw new Error("Authentication required. Please refresh the page and try again.")
      }

      console.log("Making API call to generate auth URL")

      // Use Promise.race to implement a timeout
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

      const response = (await Promise.race([
        fetchPromise,
        timeoutPromise(15000), // 15 second timeout
      ])) as Response

      console.log("API response status:", response.status)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("API error:", errorData)

        // Handle configuration errors specifically
        if (response.status === 503) {
          throw new Error(errorData.error || `${providerId} integration is not configured. Please contact support.`)
        }

        throw new Error(errorData.error || "Failed to generate auth URL")
      }

      const { authUrl } = await response.json()
      console.log("Generated auth URL, redirecting...")

      // For Teams, add a timestamp to prevent caching issues
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

      const { error } = await supabase.from("integrations").update({ status: "disconnected" }).eq("id", integrationId)

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

      // Use Promise.race to implement a timeout
      const fetchPromise = fetch(`/api/integrations/refresh-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integrationId,
        }),
      })

      const response = (await Promise.race([
        fetchPromise,
        timeoutPromise(10000), // 10 second timeout
      ])) as Response

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

      // Use Promise.race to implement a timeout
      const fetchPromise = fetch("/api/integrations/refresh-tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const response = (await Promise.race([
        fetchPromise,
        timeoutPromise(15000), // 15 second timeout
      ])) as Response

      if (!response.ok) {
        // If the endpoint doesn't exist, just refresh the data
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

      // Fallback to just refreshing the data
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
        // Add a longer delay to ensure database operations are complete
        setTimeout(() => {
          get().fetchIntegrations(true)
        }, 2000)

        // Clean up URL parameters
        const newUrl = window.location.pathname
        window.history.replaceState({}, "", newUrl)
      }
    }
  },

  initializeGlobalPreload: async () => {
    const state = get()
    if (state.preloadStarted || state.globalPreloadingData) {
      return // Already started or in progress
    }

    set({ preloadStarted: true, globalPreloadingData: true })

    try {
      // First fetch integrations if not already loaded
      if (state.integrations.length === 0) {
        await state.fetchIntegrations(true)
      }

      // Get updated integrations after fetch
      const updatedState = get()
      const connectedIntegrations = updatedState.integrations.filter((i) => i.status === "connected")

      if (connectedIntegrations.length === 0) {
        set({ globalPreloadingData: false })
        return
      }

      // Get all possible data types
      const allDataTypes = getAllDynamicDataTypes()
      const connectedProviders = connectedIntegrations.map((i) => i.provider)
      const relevantDataTypes = allDataTypes.filter((dt) => connectedProviders.includes(dt.provider))

      console.log(
        `Starting global preload for ${relevantDataTypes.length} data types across ${connectedProviders.length} providers`,
      )

      // Initialize progress tracking
      const initialProgress: { [key: string]: boolean } = {}
      relevantDataTypes.forEach(({ provider, dataType }) => {
        initialProgress[`${provider}-${dataType}`] = false
      })
      set({ preloadProgress: initialProgress })

      // Fetch all data types with controlled concurrency
      const batchSize = 2 // Reduced to be more gentle on APIs
      for (let i = 0; i < relevantDataTypes.length; i += batchSize) {
        const batch = relevantDataTypes.slice(i, i + batchSize)

        await Promise.allSettled(
          batch.map(async ({ provider, dataType }) => {
            try {
              await get().fetchDynamicData(provider, dataType)
              // Update progress
              set((state) => ({
                preloadProgress: {
                  ...state.preloadProgress,
                  [`${provider}-${dataType}`]: true,
                },
              }))
            } catch (error) {
              console.error(`Failed to preload ${provider}-${dataType}:`, error)
              // Mark as completed even if failed to avoid blocking
              set((state) => ({
                preloadProgress: {
                  ...state.preloadProgress,
                  [`${provider}-${dataType}`]: true,
                },
              }))
            }
          }),
        )

        // Small delay between batches to be API-friendly
        if (i + batchSize < relevantDataTypes.length) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }

      console.log("Global preload completed")
    } catch (error) {
      console.error("Error during global preload:", error)
    } finally {
      set({ globalPreloadingData: false })
    }
  },

  fetchDynamicData: async (provider: string, dataType: string) => {
    try {
      console.log(`Fetching dynamic data for ${provider}-${dataType}`)
      // Implement your data fetching logic here based on provider and dataType
      // This is a placeholder, replace with actual API calls or data retrieval
      await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulate API call
      console.log(`Successfully fetched data for ${provider}-${dataType}`)
      return { success: true, data: [] } // Replace with actual data
    } catch (error) {
      console.error(`Error fetching data for ${provider}-${dataType}:`, error)
      throw error
    }
  },
  ensureDataPreloaded: async () => {
    const state = get()

    // If already preloading or completed, don't start again
    if (state.globalPreloadingData || state.preloadStarted) {
      return
    }

    // Check if we have recent data (within last 5 minutes)
    if (state.lastRefreshed) {
      const lastRefresh = new Date(state.lastRefreshed)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      if (lastRefresh > fiveMinutesAgo && state.integrations.length > 0) {
        console.log("Data is recent, skipping preload")
        return
      }
    }

    console.log("Starting data preload from dashboard/page access")
    await state.initializeGlobalPreload()
  },
}))
