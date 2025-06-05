"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { getSupabaseClient } from "@/lib/supabase"
import { toast } from "@/hooks/use-toast"
import { generateOAuthState } from "@/lib/oauth/utils"

interface Integration {
  id: string
  provider: string
  provider_user_id?: string
  status: "connected" | "disconnected" | "error"
  scopes?: string[]
  metadata: any
  created_at: string
  updated_at: string
  verified?: boolean
  verifiedScopes?: string[]
}

interface IntegrationProvider {
  id: string
  name: string
  description: string
  icon: string
  logoColor: string
  authType: "oauth" | "api_key"
  scopes: string[]
  capabilities: string[]
  category: string
  requiresSetup?: boolean
  connected?: boolean
  integration?: Integration
  comingSoon?: boolean
}

interface IntegrationState {
  integrations: Integration[]
  providers: IntegrationProvider[]
  loading: boolean
  error: string | null
  lastFetched: number | null
  verifyingScopes: boolean
  connectingProvider: string | null
}

interface IntegrationActions {
  fetchIntegrations: (force?: boolean) => Promise<void>
  verifyIntegrationScopes: () => Promise<void>
  connectIntegration: (provider: string, forceOAuth?: boolean) => Promise<void>
  disconnectIntegration: (id: string) => Promise<void>
  executeAction: (integration: Integration, action: string, params: any) => Promise<any>
  refreshToken: (integration: Integration) => Promise<void>
  clearCache: () => void
}

const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  // Communication
  {
    id: "slack",
    name: "Slack",
    description: "Send messages and manage channels",
    icon: "#",
    logoColor: "bg-purple-600 text-white",
    authType: "oauth",
    scopes: [
      "chat:write",
      "chat:write.public",
      "channels:read",
      "channels:join",
      "groups:read",
      "im:read",
      "users:read",
      "team:read",
      "files:write",
      "reactions:write",
    ],
    capabilities: ["Send messages", "Create channels", "Manage users", "Upload files", "Add reactions"],
    category: "Communication",
    requiresSetup: !process.env.NEXT_PUBLIC_SLACK_CLIENT_ID,
  },
  {
    id: "discord",
    name: "Discord",
    description: "Manage Discord servers and channels",
    icon: "#",
    logoColor: "bg-indigo-600 text-white",
    authType: "oauth",
    scopes: ["identify", "guilds", "guilds.join", "messages.read"],
    capabilities: ["Send messages", "Manage channels", "Create webhooks", "Moderate servers"],
    category: "Communication",
    requiresSetup: !process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Collaborate and communicate with Teams",
    icon: "#",
    logoColor: "bg-blue-600 text-white",
    authType: "oauth",
    scopes: ["User.Read", "Chat.ReadWrite", "Team.ReadBasic.All"],
    capabilities: ["Send messages", "Create meetings", "Manage teams", "Share files"],
    category: "Communication",
    requiresSetup: !process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID,
  },

  // Productivity
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Manage events and schedules",
    icon: "#",
    logoColor: "bg-blue-500 text-white",
    authType: "oauth",
    scopes: ["https://www.googleapis.com/auth/calendar"],
    capabilities: ["Create events", "Update events", "Delete events", "List calendars"],
    category: "Productivity",
    requiresSetup: !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Create and manage spreadsheets",
    icon: "#",
    logoColor: "bg-green-600 text-white",
    authType: "oauth",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    capabilities: ["Read sheets", "Write data", "Create sheets", "Format cells"],
    category: "Productivity",
    requiresSetup: !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  },
  {
    id: "google-docs",
    name: "Google Docs",
    description: "Create and manage documents",
    icon: "#",
    logoColor: "bg-blue-400 text-white",
    authType: "oauth",
    scopes: ["https://www.googleapis.com/auth/documents"],
    capabilities: ["Create documents", "Edit documents", "Share documents", "Format text"],
    category: "Productivity",
    requiresSetup: !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Manage pages and databases",
    icon: "#",
    logoColor: "bg-gray-800 text-white",
    authType: "oauth",
    scopes: ["read", "update", "insert"],
    capabilities: ["Create pages", "Update databases", "Query content", "Manage blocks"],
    category: "Productivity",
    requiresSetup: !process.env.NEXT_PUBLIC_NOTION_CLIENT_ID,
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Organize data in flexible databases",
    icon: "#",
    logoColor: "bg-orange-500 text-white",
    authType: "oauth",
    scopes: ["data.records:read", "data.records:write", "schema.bases:read"],
    capabilities: ["Read records", "Create records", "Update records", "Manage bases"],
    category: "Productivity",
    requiresSetup: !process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID,
  },
  {
    id: "trello",
    name: "Trello",
    description: "Manage boards and cards",
    icon: "#",
    logoColor: "bg-blue-600 text-white",
    authType: "oauth",
    scopes: ["read", "write"],
    capabilities: ["Create cards", "Move cards", "Manage boards", "Add comments"],
    category: "Productivity",
    requiresSetup: !process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID,
  },

  // Development
  {
    id: "github",
    name: "GitHub",
    description: "Manage repositories and issues",
    icon: "#",
    logoColor: "bg-gray-900 text-white",
    authType: "oauth",
    scopes: ["repo", "user", "workflow"],
    capabilities: ["Create issues", "Manage repositories", "Deploy code", "Review PRs"],
    category: "Development",
    requiresSetup: !process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "DevOps platform for code management",
    icon: "#",
    logoColor: "bg-orange-600 text-white",
    authType: "oauth",
    scopes: ["api"],
    capabilities: ["Manage projects", "Create issues", "Deploy pipelines", "Review code"],
    category: "Development",
    requiresSetup: !process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID,
  },
  {
    id: "docker",
    name: "Docker Hub",
    description: "Manage container images",
    icon: "#",
    logoColor: "bg-blue-500 text-white",
    authType: "oauth",
    scopes: ["repo:read", "repo:write"],
    capabilities: ["Push images", "Pull images", "Manage repositories", "View analytics"],
    category: "Development",
    requiresSetup: !process.env.NEXT_PUBLIC_DOCKER_CLIENT_ID,
  },

  // E-commerce & Payments
  {
    id: "stripe",
    name: "Stripe",
    description: "Process payments and manage subscriptions",
    icon: "#",
    logoColor: "bg-purple-600 text-white",
    authType: "oauth",
    scopes: ["read_write"],
    capabilities: ["Process payments", "Manage customers", "Handle subscriptions", "Generate reports"],
    category: "E-commerce",
    requiresSetup: !process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID,
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Accept payments worldwide",
    icon: "#",
    logoColor: "bg-blue-600 text-white",
    authType: "oauth",
    scopes: ["https://uri.paypal.com/services/payments/payment"],
    capabilities: ["Process payments", "Manage invoices", "Handle refunds", "Track transactions"],
    category: "E-commerce",
    requiresSetup: !process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Manage your online store",
    icon: "#",
    logoColor: "bg-green-600 text-white",
    authType: "oauth",
    scopes: ["read_products", "write_products", "read_orders", "write_orders"],
    capabilities: ["Manage products", "Process orders", "Handle inventory", "Generate reports"],
    category: "E-commerce",
    requiresSetup: !process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID,
  },

  // Social Media
  {
    id: "twitter",
    name: "Twitter/X",
    description: "Post tweets and manage social presence",
    icon: "#",
    logoColor: "bg-black text-white",
    authType: "oauth",
    scopes: ["tweet.read", "tweet.write", "users.read"],
    capabilities: ["Post tweets", "Read timeline", "Manage followers", "Analyze engagement"],
    category: "Social Media",
    requiresSetup: !process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID,
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Manage Facebook pages and posts",
    icon: "#",
    logoColor: "bg-blue-600 text-white",
    authType: "oauth",
    scopes: ["pages_manage_posts", "pages_read_engagement"],
    capabilities: ["Post content", "Manage pages", "View insights", "Respond to comments"],
    category: "Social Media",
    requiresSetup: true,
    comingSoon: true,
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Share photos and manage Instagram presence",
    icon: "#",
    logoColor: "bg-pink-600 text-white",
    authType: "oauth",
    scopes: ["instagram_basic", "instagram_content_publish"],
    capabilities: ["Post photos", "Manage stories", "View insights", "Engage with followers"],
    category: "Social Media",
    requiresSetup: true,
    comingSoon: true,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Professional networking and content sharing",
    icon: "#",
    logoColor: "bg-blue-700 text-white",
    authType: "oauth",
    scopes: ["r_liteprofile", "r_emailaddress", "w_member_social"],
    capabilities: ["Share posts", "Manage connections", "View analytics", "Company updates"],
    category: "Social Media",
    requiresSetup: !process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID,
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Manage videos and channel content",
    icon: "#",
    logoColor: "bg-red-600 text-white",
    authType: "oauth",
    scopes: ["https://www.googleapis.com/auth/youtube.upload"],
    capabilities: ["Upload videos", "Manage playlists", "View analytics", "Moderate comments"],
    category: "Social Media",
    requiresSetup: !process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID,
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Create and manage TikTok content",
    icon: "#",
    logoColor: "bg-black text-white",
    authType: "oauth",
    scopes: ["user.info.basic", "video.upload"],
    capabilities: ["Upload videos", "Manage profile", "View analytics", "Engage with content"],
    category: "Social Media",
    requiresSetup: true,
    comingSoon: true,
  },

  // Marketing & Email
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Email marketing and automation",
    icon: "#",
    logoColor: "bg-yellow-500 text-white",
    authType: "oauth",
    scopes: ["read", "write"],
    capabilities: ["Send campaigns", "Manage lists", "Create automations", "View reports"],
    category: "Marketing",
    requiresSetup: !process.env.NEXT_PUBLIC_MAILCHIMP_CLIENT_ID,
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "CRM and marketing automation",
    icon: "#",
    logoColor: "bg-orange-600 text-white",
    authType: "oauth",
    scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"],
    capabilities: ["Manage contacts", "Create deals", "Send emails", "Track analytics"],
    category: "Marketing",
    requiresSetup: !process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID,
  },

  // Cloud Storage
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Cloud file storage and sharing",
    icon: "#",
    logoColor: "bg-blue-600 text-white",
    authType: "oauth",
    scopes: ["files.content.write", "files.content.read"],
    capabilities: ["Upload files", "Download files", "Share folders", "Sync content"],
    category: "Cloud Storage",
    requiresSetup: !process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID,
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "Microsoft cloud storage",
    icon: "#",
    logoColor: "bg-blue-500 text-white",
    authType: "oauth",
    scopes: ["https://graph.microsoft.com/Files.ReadWrite"],
    capabilities: ["Store files", "Share documents", "Collaborate", "Sync across devices"],
    category: "Cloud Storage",
    requiresSetup: !process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID,
  },

  // Email
  {
    id: "gmail",
    name: "Gmail",
    description: "Send and manage emails",
    icon: "#",
    logoColor: "bg-red-500 text-white",
    authType: "oauth",
    scopes: ["https://www.googleapis.com/auth/gmail.modify"],
    capabilities: ["Send emails", "Read messages", "Compose emails", "Manage labels", "Search inbox", "Modify emails"],
    category: "Email",
    requiresSetup: !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  },
]

export const useIntegrationStore = create<IntegrationState & IntegrationActions>()(
  persist(
    (set, get) => ({
      integrations: [],
      providers: INTEGRATION_PROVIDERS,
      loading: false,
      error: null,
      lastFetched: null,
      verifyingScopes: false,
      connectingProvider: null,

      fetchIntegrations: async (force = false) => {
        const state = get()
        const now = Date.now()

        // Force refresh after OAuth callback or if explicitly requested
        if (!force && state.lastFetched && now - state.lastFetched < 5000 && state.integrations.length > 0) {
          console.log("Using cached integrations data")
          return
        }

        set({ loading: true, error: null })

        try {
          console.log("Fetching integrations from database...")

          const supabase = getSupabaseClient()
          if (!supabase) {
            const errorMessage = "Supabase client not available, missing required environment variables"
            console.error(errorMessage)
            set({ error: errorMessage, loading: false })
            return
          }

          const {
            data: { session },
          } = await supabase.auth.getSession()

          if (!session) {
            console.log("No session found")
            set({ integrations: [], loading: false, lastFetched: now })
            return
          }

          const { data, error } = await supabase
            .from("integrations")
            .select("*")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false })

          if (error) {
            console.error("Supabase error:", error)
            throw error
          }

          console.log("Fetched integrations:", data)
          set({
            integrations: data || [],
            loading: false,
            lastFetched: now,
          })
        } catch (error: any) {
          console.error("Error fetching integrations:", error)
          set({ error: error.message, loading: false })
          throw error
        }
      },

      verifyIntegrationScopes: async () => {
        set({ verifyingScopes: true })
        try {
          const response = await fetch("/api/integrations/verify-scopes")

          // Check if response is OK before trying to parse JSON
          if (!response.ok) {
            const errorText = await response.text()
            console.error(`Error response (${response.status}):`, errorText)
            throw new Error(`API error: ${response.status}`)
          }

          // Now safely parse JSON
          const data = await response.json()

          if (data.error) {
            throw new Error(data.error)
          }

          set((state) => ({
            integrations: data.integrations || state.integrations,
            verifyingScopes: false,
          }))

          return data.integrations
        } catch (error: any) {
          console.error("Error verifying integration scopes:", error)
          set({ error: error.message, verifyingScopes: false })
          return get().integrations
        }
      },

      connectIntegration: async (provider: string, forceOAuth = false) => {
        set({ loading: true, error: null, connectingProvider: provider })

        try {
          const providerConfig = INTEGRATION_PROVIDERS.find((p) => p.id === provider)
          if (!providerConfig) {
            throw new Error(`Provider ${provider} not found`)
          }

          // Check if this is a "Coming Soon" integration
          if (providerConfig.comingSoon) {
            toast({
              title: "Coming Soon",
              description: `${providerConfig.name} integration is coming soon! Stay tuned for updates.`,
              variant: "default",
            })
            set({ loading: false, connectingProvider: null })
            return
          }

          console.log(`Connecting ${provider}, forceOAuth: ${forceOAuth}`)

          const existingIntegration = get().integrations.find(
            (i) => i.provider === provider && i.status === "connected",
          )

          // For OAuth providers, start the OAuth flow
          console.log(`Starting OAuth flow for ${provider}`)

          const supabase = getSupabaseClient()
          if (!supabase) {
            throw new Error("Supabase client not available, missing required environment variables")
          }

          const {
            data: { session },
          } = await supabase.auth.getSession()

          if (!session) {
            toast({
              title: "Authentication Required",
              description: "Please log in to connect integrations.",
              variant: "destructive",
            })
            set({ loading: false, connectingProvider: null })
            return
          }

          const userId = session.user.id
          const disconnectedIntegration = get().integrations.find(
            (i) => i.provider === provider && i.status === "disconnected",
          )

          // Generate state with user ID included
          const state = generateOAuthState(provider, userId, {
            reconnect: !!disconnectedIntegration || !!existingIntegration,
            integrationId: disconnectedIntegration?.id || existingIntegration?.id,
            requireFullScopes: true,
          })

          // If there's an existing integration, mark it as being reconnected
          if (existingIntegration) {
            await supabase
              .from("integrations")
              .update({
                status: "reconnecting",
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingIntegration.id)
          }

          let authUrl = ""
          const redirectUri = `https://chainreact.app/api/integrations/${provider}/callback`

          switch (provider) {
            case "slack":
              if (process.env.NEXT_PUBLIC_SLACK_CLIENT_ID) {
                // Always include the complete set of scopes
                const requiredScopes =
                  "chat:write,chat:write.public,channels:read,channels:join,groups:read,im:read,users:read,team:read,files:write,reactions:write"
                authUrl = `https://slack.com/oauth/v2/authorize?client_id=${process.env.NEXT_PUBLIC_SLACK_CLIENT_ID}&scope=${requiredScopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&prompt=consent`
              }
              break
            case "discord":
              if (process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID) {
                // Use the updated Discord scopes
                const requiredScopes = "identify guilds guilds.join messages.read"
                authUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(requiredScopes)}&state=${state}&prompt=consent`
              }
              break
            case "dropbox":
              if (process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID) {
                authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}&force_reapprove=true&token_access_type=offline`
              }
              break
              case "gmail":
                  if (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
                      const requiredScopes = providerConfig.scopes.join(" ");
                      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(requiredScopes)}&state=${state}&access_type=offline&prompt=consent`;
                  }
                  break;
              case "notion":
                  if (process.env.NEXT_PUBLIC_NOTION_CLIENT_ID) {
                      const requiredScopes = providerConfig.scopes.join(" ");
                      authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_NOTION_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&owner=user&scope=${encodeURIComponent(requiredScopes)}&state=${state}`;
                  }
                  break;

          }

          if (authUrl) {
            console.log(`Redirecting to OAuth URL for ${provider}:`, authUrl)

            // Set up a listener for when the user returns from OAuth
            const handleOAuthReturn = () => {
              console.log("OAuth return detected, refreshing integrations...")
              setTimeout(() => {
                get().fetchIntegrations(true)
                set({ loading: false, connectingProvider: null })
              }, 2000) // Give the callback time to save the integration
            }

            // Listen for focus events (when user returns to the tab)
            window.addEventListener("focus", handleOAuthReturn, { once: true })

            // Set a timeout to reset the connecting state
            setTimeout(() => {
              window.removeEventListener("focus", handleOAuthReturn)
              set({ loading: false, connectingProvider: null })
            }, 300000) // 5 minutes timeout

            window.location.href = authUrl
            return
          } else {
            const errorMessage = `OAuth not configured for ${providerConfig.name}. Please check your environment variables.`
            console.error(errorMessage)
            toast({
              title: "OAuth Configuration Error",
              description: errorMessage,
              variant: "destructive",
            })
            set({ loading: false, connectingProvider: null, error: errorMessage })
          }
        } catch (error: any) {
          console.error("Connect integration error:", error)
          toast({
            title: "Connection Failed",
            description: error.message || "Failed to connect integration. Please try again.",
            variant: "destructive",
          })
          set({ error: error.message, loading: false, connectingProvider: null })
          throw error
        }
      },

      disconnectIntegration: async (id: string) => {
        const supabase = getSupabaseClient()
        if (!supabase) {
          const errorMessage = "Supabase client not available, missing required environment variables"
          console.error(errorMessage)
          toast({
            title: "Disconnection Failed",
            description: errorMessage,
            variant: "destructive",
          })
          set({ error: errorMessage })
          return
        }

        const integration = get().integrations.find((i) => i.id === id)
        const providerName = integration
          ? INTEGRATION_PROVIDERS.find((p) => p.id === integration.provider)?.name
          : "Integration"

        try {
          const { error } = await supabase
            .from("integrations")
            .update({
              status: "disconnected",
              updated_at: new Date().toISOString(),
            })
            .eq("id", id)

          if (error) throw error

          await get().fetchIntegrations(true)
          toast({
            title: "Integration Disconnected",
            description: `${providerName} has been disconnected successfully.`,
            variant: "default",
          })
        } catch (error: any) {
          toast({
            title: "Disconnection Failed",
            description: error.message || "Failed to disconnect integration. Please try again.",
            variant: "destructive",
          })
          set({ error: error.message })
          throw error
        }
      },

      executeAction: async (integration: Integration, action: string, params: any) => {
        try {
          const response = await fetch("/api/integrations/execute", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              integrationId: integration.id,
              action,
              params,
            }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Failed to execute action: ${errorText}`)
          }

          return await response.json()
        } catch (error: any) {
          toast({
            title: "Action Failed",
            description: error.message || "Failed to execute integration action. Please try again.",
            variant: "destructive",
          })
          set({ error: error.message })
          throw error
        }
      },

      refreshToken: async (integration: Integration) => {
        console.log("Refreshing token for integration:", integration.id)
        // Implementation for token refresh
      },

      clearCache: () => {
        set({ integrations: [], lastFetched: null })
      },
    }),
    {
      name: "integration-store",
      partialize: (state) => ({
        integrations: state.integrations,
        lastFetched: state.lastFetched,
      }),
    },
  ),
)
