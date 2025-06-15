import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createClient } from "@supabase/supabase-js"
import { toast } from "@/hooks/use-toast"

// Types
interface Integration {
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
  last_sync?: string
  error_message?: string
}

interface Provider {
  id: string
  name: string
  description: string
  category: string
  icon: string
  color: string
  isAvailable: boolean
  capabilities?: string[]
}

interface IntegrationStore {
  integrations: Integration[]
  providers: Provider[]
  isLoading: boolean
  error: string | null
  debugInfo: any

  // Actions
  initializeProviders: () => void
  fetchIntegrations: (forceRefresh?: boolean) => Promise<void>
  connectIntegration: (providerId: string) => Promise<void>
  disconnectIntegration: (integrationId: string) => Promise<void>
  refreshAllTokens: () => Promise<void>
  clearError: () => void

  // Utilities
  getIntegrationByProvider: (providerId: string) => Integration | null
  getIntegrationStatus: (providerId: string) => string
  getConnectedProviders: () => string[]
}

// Create Supabase client for client-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper function to get authenticated user
const getAuthenticatedUser = async () => {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (error) {
      console.error("Session error:", error)
      throw new Error(`Authentication error: ${error.message}`)
    }

    if (!session?.user?.id) {
      console.error("No valid session found")
      throw new Error("Please log in to continue")
    }

    console.log("✅ User authenticated:", session.user.id)
    return session
  } catch (error) {
    console.error("❌ Authentication failed:", error)
    throw error
  }
}

// Helper function to make authenticated API calls
const makeAuthenticatedRequest = async (url: string, options: RequestInit = {}) => {
  try {
    const session = await getAuthenticatedUser()

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    }

    console.log(`🔄 Making authenticated request to ${url}`)

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error(`❌ API request failed:`, {
        url,
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      })

      if (response.status === 401) {
        throw new Error("Your session has expired. Please log in again.")
      }

      throw new Error(errorData.error || `Request failed: ${response.statusText}`)
    }

    const data = await response.json()
    console.log(`✅ API request successful:`, { url, dataCount: data.data?.length || 0 })
    return data
  } catch (error) {
    console.error(`❌ Request to ${url} failed:`, error)
    throw error
  }
}

export const useIntegrationStore = create<IntegrationStore>()(
  persist(
    (set, get) => ({
      integrations: [],
      providers: [],
      isLoading: false,
      error: null,
      debugInfo: {},

      initializeProviders: () => {
        console.log("🚀 Initializing providers...")

        // Available providers based on environment variables
        const availableProviders: Provider[] = [
          {
            id: "google",
            name: "Google",
            description: "Connect your Google account for Gmail, Drive, Calendar, and more",
            category: "Productivity",
            icon: "🔍",
            color: "#4285f4",
            isAvailable: !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
            capabilities: ["email", "calendar", "drive", "sheets", "docs"],
          },
          {
            id: "slack",
            name: "Slack",
            description: "Send messages and manage channels in your Slack workspace",
            category: "Communication",
            icon: "💬",
            color: "#4a154b",
            isAvailable: !!process.env.NEXT_PUBLIC_SLACK_CLIENT_ID,
            capabilities: ["messaging", "channels", "files"],
          },
          {
            id: "github",
            name: "GitHub",
            description: "Manage repositories, issues, and pull requests",
            category: "Development",
            icon: "🐙",
            color: "#333",
            isAvailable: !!process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
            capabilities: ["repositories", "issues", "pull_requests"],
          },
          {
            id: "discord",
            name: "Discord",
            description: "Send messages and manage Discord servers",
            category: "Communication",
            icon: "🎮",
            color: "#5865f2",
            isAvailable: !!process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
            capabilities: ["messaging", "servers", "voice"],
          },
          {
            id: "notion",
            name: "Notion",
            description: "Create and manage pages, databases, and content",
            category: "Productivity",
            icon: "📝",
            color: "#000",
            isAvailable: !!process.env.NEXT_PUBLIC_NOTION_CLIENT_ID,
            capabilities: ["pages", "databases", "blocks"],
          },
          {
            id: "trello",
            name: "Trello",
            description: "Manage boards, lists, and cards",
            category: "Project Management",
            icon: "📋",
            color: "#0079bf",
            isAvailable: !!process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID,
            capabilities: ["boards", "lists", "cards"],
          },
          {
            id: "airtable",
            name: "Airtable",
            description: "Manage databases and records",
            category: "Database",
            icon: "🗃️",
            color: "#18bfff",
            isAvailable: !!process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID,
            capabilities: ["bases", "tables", "records"],
          },
          {
            id: "hubspot",
            name: "HubSpot",
            description: "Manage contacts, deals, and CRM data",
            category: "CRM",
            icon: "🎯",
            color: "#ff7a59",
            isAvailable: !!process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID,
            capabilities: ["contacts", "deals", "companies"],
          },
        ].filter((provider) => provider.isAvailable)

        console.log(
          `✅ Initialized ${availableProviders.length} providers:`,
          availableProviders.map((p) => p.name),
        )

        set({
          providers: availableProviders,
          debugInfo: {
            ...get().debugInfo,
            providersInitialized: new Date().toISOString(),
            availableProviders: availableProviders.length,
          },
        })
      },

      fetchIntegrations: async (forceRefresh = false) => {
        const { isLoading } = get()

        if (isLoading && !forceRefresh) {
          console.log("⏳ Already loading integrations, skipping...")
          return
        }

        try {
          set({ isLoading: true, error: null })
          console.log("📊 Fetching integrations...")

          // Verify authentication first
          const session = await getAuthenticatedUser()

          const data = await makeAuthenticatedRequest("/api/integrations")

          const integrations = data.data || []
          console.log(`✅ Fetched ${integrations.length} integrations:`, integrations)

          set({
            integrations,
            isLoading: false,
            debugInfo: {
              ...get().debugInfo,
              lastFetch: new Date().toISOString(),
              integrationCount: integrations.length,
              connectedCount: integrations.filter((i: Integration) => i.status === "connected").length,
              userId: session.user.id,
            },
          })
        } catch (error: any) {
          console.error("❌ Failed to fetch integrations:", error)

          let errorMessage = "Failed to load integrations"

          if (error.message.includes("session has expired") || error.message.includes("log in")) {
            errorMessage = "Your session has expired. Please refresh the page and log in again."
          } else if (error.message.includes("Authentication")) {
            errorMessage = "Authentication failed. Please log in to continue."
          } else {
            errorMessage = error.message || "Failed to load integrations. Please try again."
          }

          set({
            error: errorMessage,
            isLoading: false,
            debugInfo: {
              ...get().debugInfo,
              lastError: {
                message: error.message,
                timestamp: new Date().toISOString(),
              },
            },
          })

          toast({
            title: "Error Loading Integrations",
            description: errorMessage,
            variant: "destructive",
            duration: 7000,
          })
        }
      },

      connectIntegration: async (providerId: string) => {
        try {
          console.log(`🔗 Connecting integration: ${providerId}`)

          // Verify authentication first
          const session = await getAuthenticatedUser()

          set({ isLoading: true, error: null })

          // Generate OAuth URL
          const data = await makeAuthenticatedRequest("/api/integrations/oauth/generate-url", {
            method: "POST",
            body: JSON.stringify({ provider: providerId }),
          })

          if (!data.success || !data.authUrl) {
            throw new Error(data.error || "Failed to generate authorization URL")
          }

          console.log(`✅ Generated OAuth URL for ${providerId}`)

          // Store the provider we're connecting for callback handling
          sessionStorage.setItem("connecting_provider", providerId)

          // Redirect to OAuth provider
          window.location.href = data.authUrl
        } catch (error: any) {
          console.error(`❌ Failed to connect ${providerId}:`, error)

          let errorMessage = `Failed to connect ${providerId}`

          if (error.message.includes("session has expired") || error.message.includes("log in")) {
            errorMessage = "Your session has expired. Please refresh the page and log in again."
          } else if (error.message.includes("Authentication")) {
            errorMessage = "Authentication failed. Please log in to continue."
          } else {
            errorMessage = error.message || `Failed to connect ${providerId}. Please try again.`
          }

          set({
            error: errorMessage,
            isLoading: false,
          })

          toast({
            title: "Connection Failed",
            description: errorMessage,
            variant: "destructive",
            duration: 7000,
          })
        }
      },

      disconnectIntegration: async (integrationId: string) => {
        try {
          console.log(`🔌 Disconnecting integration: ${integrationId}`)

          // Verify authentication first
          await getAuthenticatedUser()

          set({ isLoading: true, error: null })

          await makeAuthenticatedRequest(`/api/integrations/${integrationId}`, {
            method: "DELETE",
          })

          console.log(`✅ Disconnected integration: ${integrationId}`)

          // Refresh integrations list
          await get().fetchIntegrations(true)

          toast({
            title: "Integration Disconnected",
            description: "The integration has been successfully disconnected.",
            duration: 5000,
          })
        } catch (error: any) {
          console.error(`❌ Failed to disconnect integration:`, error)

          const errorMessage = error.message || "Failed to disconnect integration. Please try again."

          set({
            error: errorMessage,
            isLoading: false,
          })

          toast({
            title: "Disconnection Failed",
            description: errorMessage,
            variant: "destructive",
            duration: 7000,
          })
        }
      },

      refreshAllTokens: async () => {
        try {
          console.log("🔄 Refreshing all tokens...")

          // Verify authentication first
          const session = await getAuthenticatedUser()

          const data = await makeAuthenticatedRequest("/api/integrations/refresh-all-tokens", {
            method: "POST",
            body: JSON.stringify({ userId: session.user.id }),
          })

          console.log("✅ Token refresh completed:", data.stats)

          // Refresh integrations list
          await get().fetchIntegrations(true)

          return data
        } catch (error: any) {
          console.error("❌ Failed to refresh tokens:", error)
          throw error
        }
      },

      clearError: () => {
        set({ error: null })
      },

      // Utility functions
      getIntegrationByProvider: (providerId: string) => {
        const { integrations } = get()
        return integrations.find((i) => i.provider === providerId) || null
      },

      getIntegrationStatus: (providerId: string) => {
        const integration = get().getIntegrationByProvider(providerId)
        return integration?.status || "disconnected"
      },

      getConnectedProviders: () => {
        const { integrations } = get()
        return integrations.filter((i) => i.status === "connected").map((i) => i.provider)
      },
    }),
    {
      name: "integration-store",
      partialize: (state) => ({
        // Only persist non-sensitive data
        providers: state.providers,
        debugInfo: state.debugInfo,
      }),
    },
  ),
)
