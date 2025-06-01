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
  // ... other providers remain the same
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

        if (!force && state.lastFetched && now - state.lastFetched < 5000 && state.integrations.length > 0) {
          console.log("Using cached integrations data")
          return
        }

        const supabase = getSupabaseClient()
        set({ loading: true, error: null })

        try {
          console.log("Fetching integrations from database...")

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

      connectIntegration: async (provider: string, forceOAuth = false) => {
        set({ loading: true, error: null })

        try {
          const providerConfig = INTEGRATION_PROVIDERS.find((p) => p.id === provider)
          if (!providerConfig) {
            throw new Error(`Provider ${provider} not found`)
          }

          console.log(`Connecting ${provider}, forceOAuth: ${forceOAuth}`)

          const existingIntegration = get().integrations.find(
            (i) => i.provider === provider && i.status === "connected",
          )

          const isOAuthProvider = providerConfig.authType === "oauth"
          if (isOAuthProvider) {
            forceOAuth = true
            console.log(`OAuth provider detected, forcing OAuth flow for ${provider}`)
          }

          if (existingIntegration && !forceOAuth) {
            console.log(`${provider} is already connected and not forcing OAuth`)
            set({ loading: false })
            return
          }

          const disconnectedIntegration = get().integrations.find(
            (i) => i.provider === provider && i.status === "disconnected",
          )

          if (isOAuthProvider && forceOAuth) {
            console.log(`Starting OAuth flow for ${provider}`)

            const redirectUri = `https://chainreact.app/api/integrations/${provider}/callback`
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
                  // Updated Slack OAuth URL with proper parameters for distributed apps
                  authUrl = `https://slack.com/oauth/v2/authorize?client_id=${process.env.NEXT_PUBLIC_SLACK_CLIENT_ID}&scope=chat:write,chat:write.public,channels:read,channels:join,groups:read,im:read,users:read,team:read,files:write,reactions:write&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&user_scope=&team=${""}`
                }
                break
              case "discord":
                if (process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID) {
                  authUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=bot&state=${state}&prompt=consent&t=${timestamp}`
                }
                break
              case "teams":
                if (process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID) {
                  const scopes = encodeURIComponent(providerConfig.scopes.join(" "))
                  authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}&prompt=consent&t=${timestamp}`
                }
                break
              case "google-calendar":
              case "google-sheets":
              case "google-drive":
              case "gmail":
              case "google-analytics":
              case "youtube":
                if (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
                  const scopes = providerConfig.scopes.join(" ")
                  authUrl = `https://accounts.google.com/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&state=${state}&access_type=offline&prompt=consent&t=${timestamp}`
                }
                break
              case "github":
                if (process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID) {
                  authUrl = `https://github.com/login/oauth/authorize?client_id=${
                    process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
                  }&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(
                    providerConfig.scopes.join(" "),
                  )}&state=${state}&allow_signup=true&force_login=true&prompt=consent&t=${timestamp}`
                }
                break
              // ... other providers remain the same
            }

            if (authUrl) {
              console.log(`Redirecting to OAuth URL for ${provider}:`, authUrl)
              window.location.replace(authUrl)
              return
            } else {
              console.log(`OAuth not configured for ${provider}, falling back to demo mode`)
            }
          }

          // ... rest of the method remains the same
        } catch (error: any) {
          console.error("Connect integration error:", error)
          set({ error: error.message, loading: false })
          throw error
        }
      },

      // ... other methods remain the same
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
