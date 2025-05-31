"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { getSupabaseClient } from "@/lib/supabase"

interface Integration {
  id: string
  provider: string
  provider_user_id?: string
  status: "connected" | "disconnected" | "error"
  scopes?: string[]
  metadata: any
  created_at: string
  updated_at: string
}

interface IntegrationProvider {
  id: string
  name: string
  description: string
  icon: string
  logoColor: string
  authType: "oauth" | "api_key" | "demo"
  scopes: string[]
  capabilities: string[]
  category: string
  requiresSetup?: boolean
  connected?: boolean
  integration?: Integration
}

interface IntegrationState {
  integrations: Integration[]
  providers: IntegrationProvider[]
  loading: boolean
  error: string | null
  lastFetched: number | null
}

interface IntegrationActions {
  fetchIntegrations: (force?: boolean) => Promise<void>
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
    authType: process.env.NEXT_PUBLIC_SLACK_CLIENT_ID ? "oauth" : "demo",
    scopes: ["chat:write", "channels:read"],
    capabilities: ["Send messages", "Create channels", "Manage users"],
    category: "Communication",
    requiresSetup: !process.env.NEXT_PUBLIC_SLACK_CLIENT_ID,
  },
  {
    id: "discord",
    name: "Discord",
    description: "Send messages to Discord channels",
    icon: "🎮",
    logoColor: "bg-indigo-600 text-white",
    authType: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ? "oauth" : "demo",
    scopes: ["bot"],
    capabilities: ["Send messages", "Manage channels"],
    category: "Communication",
    requiresSetup: !process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Send messages and manage Teams channels",
    icon: "T",
    logoColor: "bg-blue-600 text-white",
    authType: "demo",
    scopes: ["chat:write"],
    capabilities: ["Send messages", "Create meetings", "Manage channels"],
    category: "Communication",
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Send messages via Telegram bot",
    icon: "✈️",
    logoColor: "bg-blue-500 text-white",
    authType: "api_key",
    scopes: [],
    capabilities: ["Send messages", "Create bots", "Manage groups"],
    category: "Communication",
  },

  // Productivity
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Create and manage calendar events",
    icon: "📅",
    logoColor: "bg-blue-500 text-white",
    authType: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? "oauth" : "demo",
    scopes: ["https://www.googleapis.com/auth/calendar"],
    capabilities: ["Create events", "Update events", "Delete events"],
    category: "Productivity",
    requiresSetup: !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Read and write spreadsheet data",
    icon: "📊",
    logoColor: "bg-green-600 text-white",
    authType: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? "oauth" : "demo",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    capabilities: ["Read data", "Append rows", "Update cells"],
    category: "Productivity",
    requiresSetup: !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Upload and manage files in Google Drive",
    icon: "📁",
    logoColor: "bg-yellow-500 text-white",
    authType: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? "oauth" : "demo",
    scopes: ["https://www.googleapis.com/auth/drive"],
    capabilities: ["Upload files", "Create folders", "Share files"],
    category: "Productivity",
    requiresSetup: !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Create and update Notion pages and databases",
    icon: "N",
    logoColor: "bg-gray-900 text-white",
    authType: "demo",
    scopes: ["read", "write"],
    capabilities: ["Create pages", "Update databases", "Query content"],
    category: "Productivity",
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Manage Airtable bases and records",
    icon: "🔶",
    logoColor: "bg-orange-500 text-white",
    authType: "api_key",
    scopes: [],
    capabilities: ["Create records", "Update records", "Query data"],
    category: "Productivity",
  },
  {
    id: "trello",
    name: "Trello",
    description: "Create and manage Trello cards and boards",
    icon: "📋",
    logoColor: "bg-blue-600 text-white",
    authType: "demo",
    scopes: ["read", "write"],
    capabilities: ["Create cards", "Move cards", "Manage boards"],
    category: "Productivity",
  },

  // Payment & E-commerce
  {
    id: "stripe",
    name: "Stripe",
    description: "Process payments and webhooks",
    icon: "S",
    logoColor: "bg-purple-600 text-white",
    authType: "api_key",
    scopes: [],
    capabilities: ["Process payments", "Handle webhooks", "Manage customers"],
    category: "Payment",
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Process PayPal payments and transactions",
    icon: "P",
    logoColor: "bg-blue-600 text-white",
    authType: "demo",
    scopes: ["payments"],
    capabilities: ["Process payments", "Manage transactions", "Handle refunds"],
    category: "Payment",
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Manage Shopify store and orders",
    icon: "🛍️",
    logoColor: "bg-green-600 text-white",
    authType: "demo",
    scopes: ["read_orders", "write_products"],
    capabilities: ["Manage products", "Process orders", "Update inventory"],
    category: "E-commerce",
  },

  // Social Media
  {
    id: "twitter",
    name: "Twitter/X",
    description: "Post tweets and manage Twitter account",
    icon: "𝕏",
    logoColor: "bg-black text-white",
    authType: "demo",
    scopes: ["tweet.write", "users.read"],
    capabilities: ["Post tweets", "Read timeline", "Manage followers"],
    category: "Social Media",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Post updates and manage LinkedIn profile",
    icon: "in",
    logoColor: "bg-blue-700 text-white",
    authType: "demo",
    scopes: ["w_member_social"],
    capabilities: ["Post updates", "Manage profile", "Send messages"],
    category: "Social Media",
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Post to Facebook pages and manage content",
    icon: "f",
    logoColor: "bg-blue-600 text-white",
    authType: "demo",
    scopes: ["pages_manage_posts"],
    capabilities: ["Post updates", "Manage pages", "Schedule posts"],
    category: "Social Media",
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Post photos and manage Instagram account",
    icon: "📷",
    logoColor: "bg-gradient-to-br from-purple-600 to-pink-500 text-white",
    authType: "demo",
    scopes: ["instagram_basic"],
    capabilities: ["Post photos", "Manage account", "View insights"],
    category: "Social Media",
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Upload videos and manage YouTube channel",
    icon: "▶️",
    logoColor: "bg-red-600 text-white",
    authType: "demo",
    scopes: ["youtube.upload"],
    capabilities: ["Upload videos", "Manage playlists", "View analytics"],
    category: "Social Media",
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Post videos and manage TikTok account",
    icon: "🎵",
    logoColor: "bg-black text-white",
    authType: "demo",
    scopes: ["video.upload"],
    capabilities: ["Upload videos", "Manage account", "View analytics"],
    category: "Social Media",
  },

  // Email & Marketing
  {
    id: "gmail",
    name: "Gmail",
    description: "Send and manage Gmail emails",
    icon: "✉️",
    logoColor: "bg-red-500 text-white",
    authType: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? "oauth" : "demo",
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    capabilities: ["Send emails", "Read emails", "Manage labels"],
    category: "Email",
    requiresSetup: !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Manage email campaigns and subscribers",
    icon: "🐵",
    logoColor: "bg-yellow-500 text-white",
    authType: "demo",
    scopes: ["campaigns:read", "lists:write"],
    capabilities: ["Send campaigns", "Manage lists", "Track analytics"],
    category: "Email",
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    description: "Send transactional and marketing emails",
    icon: "📧",
    logoColor: "bg-blue-500 text-white",
    authType: "api_key",
    scopes: [],
    capabilities: ["Send emails", "Manage templates", "Track delivery"],
    category: "Email",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Manage CRM contacts and marketing automation",
    icon: "🧡",
    logoColor: "bg-orange-500 text-white",
    authType: "demo",
    scopes: ["contacts", "automation"],
    capabilities: ["Manage contacts", "Create deals", "Send emails"],
    category: "Email",
  },

  // Development & DevOps
  {
    id: "github",
    name: "GitHub",
    description: "Manage repositories and GitHub workflows",
    icon: "🐙",
    logoColor: "bg-gray-900 text-white",
    authType: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ? "oauth" : "demo",
    scopes: ["repo", "workflow"],
    capabilities: ["Manage repos", "Create issues", "Deploy code"],
    category: "Development",
    requiresSetup: !process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Manage GitLab projects and CI/CD",
    icon: "🦊",
    logoColor: "bg-orange-600 text-white",
    authType: "demo",
    scopes: ["api", "read_repository"],
    capabilities: ["Manage projects", "Run pipelines", "Deploy apps"],
    category: "Development",
  },
  {
    id: "aws",
    name: "Amazon AWS",
    description: "Manage AWS services and resources",
    icon: "☁️",
    logoColor: "bg-orange-500 text-white",
    authType: "api_key",
    scopes: [],
    capabilities: ["Manage EC2", "Deploy Lambda", "Monitor services"],
    category: "Development",
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Deploy and manage Vercel projects",
    icon: "▲",
    logoColor: "bg-black text-white",
    authType: "api_key",
    scopes: [],
    capabilities: ["Deploy projects", "Manage domains", "Monitor performance"],
    category: "Development",
  },
  {
    id: "docker",
    name: "Docker",
    description: "Build and deploy containerized applications",
    icon: "🐳",
    logoColor: "bg-blue-500 text-white",
    authType: "demo",
    scopes: [],
    capabilities: ["Build images", "Deploy containers", "Manage registries"],
    category: "Development",
  },
  {
    id: "kubernetes",
    name: "Kubernetes",
    description: "Orchestrate and manage Kubernetes clusters",
    icon: "⚙️",
    logoColor: "bg-blue-600 text-white",
    authType: "demo",
    scopes: [],
    capabilities: ["Deploy pods", "Manage services", "Scale applications"],
    category: "Development",
  },

  // Analytics & Monitoring
  {
    id: "google-analytics",
    name: "Google Analytics",
    description: "Track website analytics and user behavior",
    icon: "📈",
    logoColor: "bg-orange-500 text-white",
    authType: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? "oauth" : "demo",
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    capabilities: ["View reports", "Track events", "Monitor traffic"],
    category: "Analytics",
    requiresSetup: !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    description: "Track user events and product analytics",
    icon: "📊",
    logoColor: "bg-purple-600 text-white",
    authType: "api_key",
    scopes: [],
    capabilities: ["Track events", "Create funnels", "Analyze cohorts"],
    category: "Analytics",
  },
  {
    id: "amplitude",
    name: "Amplitude",
    description: "Product analytics and user behavior tracking",
    icon: "📉",
    logoColor: "bg-blue-600 text-white",
    authType: "demo",
    scopes: [],
    capabilities: ["Track events", "User journeys", "Retention analysis"],
    category: "Analytics",
  },

  // File Storage & CDN
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Store and sync files in the cloud",
    icon: "📦",
    logoColor: "bg-blue-600 text-white",
    authType: "demo",
    scopes: ["files.content.write"],
    capabilities: ["Upload files", "Share folders", "Sync data"],
    category: "Storage",
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "Microsoft cloud storage and file sharing",
    icon: "☁️",
    logoColor: "bg-blue-500 text-white",
    authType: "demo",
    scopes: ["files.readwrite"],
    capabilities: ["Upload files", "Share files", "Manage folders"],
    category: "Storage",
  },

  // AI & Machine Learning
  {
    id: "openai",
    name: "OpenAI",
    description: "Generate text, images, and AI completions",
    icon: "🤖",
    logoColor: "bg-green-600 text-white",
    authType: "api_key",
    scopes: [],
    capabilities: ["Generate text", "Create images", "Chat completions"],
    category: "AI",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    description: "AI assistant for text generation and analysis",
    icon: "🧠",
    logoColor: "bg-orange-600 text-white",
    authType: "api_key",
    scopes: [],
    capabilities: ["Text generation", "Analysis", "Conversations"],
    category: "AI",
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

      fetchIntegrations: async (force = false) => {
        const state = get()
        const now = Date.now()

        // Only fetch if forced, never fetched before, or data is older than 5 seconds
        if (!force && state.lastFetched && now - state.lastFetched < 5000 && state.integrations.length > 0) {
          console.log("Using cached integrations data")
          return
        }

        const supabase = getSupabaseClient()
        set({ loading: true, error: null })

        try {
          console.log("Fetching integrations from database...")

          // Get current user session
          const {
            data: { session },
          } = await supabase.auth.getSession()

          if (!session) {
            console.log("No session found")
            set({ integrations: [], loading: false, lastFetched: now })
            return
          }

          // Fetch ALL integrations for this user (not just connected ones)
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
          throw error // Re-throw to allow component to handle it
        }
      },

      connectIntegration: async (provider: string, forceOAuth = false) => {
        set({ loading: true, error: null })

        try {
          const providerConfig = INTEGRATION_PROVIDERS.find((p) => p.id === provider)
          if (!providerConfig) {
            throw new Error(`Provider ${provider} not found`)
          }

          console.log(`Connecting ${provider}, forceOAuth: ${forceOAuth}`)

          // Check if already connected
          const existingIntegration = get().integrations.find(
            (i) => i.provider === provider && i.status === "connected",
          )

          // For OAuth providers, always force a new OAuth flow when reconnecting
          const isOAuthProvider = providerConfig.authType === "oauth"
          if (isOAuthProvider) {
            forceOAuth = true
            console.log(`OAuth provider detected, forcing OAuth flow for ${provider}`)
          }

          // Only skip if not forcing OAuth and already connected
          if (existingIntegration && !forceOAuth) {
            console.log(`${provider} is already connected and not forcing OAuth`)
            set({ loading: false })
            return
          }

          // Check if there's a disconnected integration we can reactivate
          const disconnectedIntegration = get().integrations.find(
            (i) => i.provider === provider && i.status === "disconnected",
          )

          // For OAuth providers, ALWAYS go through OAuth flow when forceOAuth is true
          if (isOAuthProvider && forceOAuth) {
            console.log(`Starting OAuth flow for ${provider}`)

            const redirectUri = `${window.location.origin}/api/integrations/${provider}/callback`
            const timestamp = Date.now()
            const state = btoa(
              JSON.stringify({
                provider,
                timestamp,
                reconnect: !!disconnectedIntegration || !!existingIntegration,
                integrationId: disconnectedIntegration?.id || existingIntegration?.id,
              }),
            )

            let authUrl = ""

            switch (provider) {
              case "slack":
                if (process.env.NEXT_PUBLIC_SLACK_CLIENT_ID) {
                  authUrl = `https://slack.com/oauth/v2/authorize?client_id=${process.env.NEXT_PUBLIC_SLACK_CLIENT_ID}&scope=chat:write,channels:read&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&prompt=consent`
                }
                break
              case "google-calendar":
              case "google-sheets":
              case "google-drive":
              case "gmail":
              case "google-analytics":
                if (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
                  const scopes = providerConfig.scopes.join(" ")
                  authUrl = `https://accounts.google.com/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}&access_type=offline&prompt=consent`
                }
                break
              case "discord":
                if (process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID) {
                  authUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=bot&state=${state}&prompt=consent`
                }
                break
              case "github":
                if (process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID) {
                  // For GitHub, add multiple parameters to force re-authentication
                  // Add timestamp to prevent caching and force fresh authorization
                  authUrl = `https://github.com/login/oauth/authorize?client_id=${
                    process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
                  }&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(
                    providerConfig.scopes.join(" "),
                  )}&state=${state}&allow_signup=true&force_login=true&prompt=consent&t=${timestamp}`
                }
                break
            }

            if (authUrl) {
              console.log(`Redirecting to OAuth URL for ${provider}:`, authUrl)
              // Use window.location.replace to ensure we don't just refresh
              window.location.replace(authUrl)
              return
            } else {
              console.log(`OAuth not configured for ${provider}, falling back to demo mode`)
              // Fall back to demo mode if OAuth not configured
            }
          }

          // For non-OAuth providers, reactivate disconnected integrations
          if (disconnectedIntegration && !isOAuthProvider && !forceOAuth) {
            console.log(`Reactivating existing ${provider} integration`)
            const supabase = getSupabaseClient()

            const { error } = await supabase
              .from("integrations")
              .update({
                status: "connected",
                updated_at: new Date().toISOString(),
              })
              .eq("id", disconnectedIntegration.id)

            if (error) throw error

            // Refresh integrations
            await get().fetchIntegrations(true)
            set({ loading: false })
            return
          }

          if (providerConfig.authType === "api_key") {
            // For API key integrations, show a prompt for the API key
            const apiKey = prompt(`Enter your ${providerConfig.name} API key:`)
            if (!apiKey) {
              set({ loading: false })
              return
            }

            // Store the API key integration
            const supabase = getSupabaseClient()
            const {
              data: { session },
            } = await supabase.auth.getSession()

            if (!session) {
              throw new Error("Not authenticated")
            }

            // If there's a disconnected integration, update it
            if (disconnectedIntegration) {
              const { error } = await supabase
                .from("integrations")
                .update({
                  access_token: apiKey,
                  status: "connected",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", disconnectedIntegration.id)

              if (error) throw error
            } else {
              // Otherwise create a new one
              const { error } = await supabase.from("integrations").insert({
                user_id: session.user.id,
                provider,
                access_token: apiKey,
                status: "connected",
                metadata: { api_key: true },
              })

              if (error) throw error
            }

            // Refresh integrations
            await get().fetchIntegrations(true)
            set({ loading: false })
            return
          }

          if (providerConfig.authType === "demo" || !isOAuthProvider) {
            // For demo integrations, create a mock connection
            const supabase = getSupabaseClient()
            const {
              data: { session },
            } = await supabase.auth.getSession()

            if (!session) {
              throw new Error("Not authenticated")
            }

            // If there's a disconnected integration, update it
            if (disconnectedIntegration) {
              const { error } = await supabase
                .from("integrations")
                .update({
                  status: "connected",
                  updated_at: new Date().toISOString(),
                  metadata: {
                    ...disconnectedIntegration.metadata,
                    reconnected_at: new Date().toISOString(),
                  },
                })
                .eq("id", disconnectedIntegration.id)

              if (error) throw error
            } else {
              // Otherwise create a new one
              const { error } = await supabase.from("integrations").insert({
                user_id: session.user.id,
                provider,
                provider_user_id: `demo_${Date.now()}`,
                access_token: `demo_token_${Date.now()}`,
                status: "connected",
                metadata: {
                  demo: true,
                  connected_at: new Date().toISOString(),
                  demo_user: `Demo User for ${providerConfig.name}`,
                  demo_account: `demo@${provider}.com`,
                },
              })

              if (error) throw error
            }

            // Refresh integrations
            await get().fetchIntegrations(true)
            set({ loading: false })
            return
          }
        } catch (error: any) {
          console.error("Connect integration error:", error)
          set({ error: error.message, loading: false })
          throw error
        }
      },

      disconnectIntegration: async (id: string) => {
        const supabase = getSupabaseClient()

        try {
          const { error } = await supabase
            .from("integrations")
            .update({
              status: "disconnected",
              updated_at: new Date().toISOString(),
            })
            .eq("id", id)

          if (error) throw error

          // Refresh integrations to update the UI
          await get().fetchIntegrations(true)
        } catch (error: any) {
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
            throw new Error("Failed to execute action")
          }

          return await response.json()
        } catch (error: any) {
          set({ error: error.message })
          throw error
        }
      },

      refreshToken: async (integration: Integration) => {
        console.log("Refreshing token for integration:", integration.id)
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
