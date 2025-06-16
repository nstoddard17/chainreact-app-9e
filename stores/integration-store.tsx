import { create } from "zustand"
import { getSupabaseClient } from "@/lib/supabase"

export interface Integration {
  id: string
  provider: string
  status: "connected" | "disconnected" | "error" | "syncing"
  created_at: string
  updated_at: string
  user_id: string
  access_token?: string
  refresh_token?: string
  expires_at?: string
  scopes?: string[]
}

export interface Provider {
  id: string
  name: string
  description: string
  logoUrl?: string
  capabilities: string[]
  isAvailable: boolean
  category?: string
}

export interface IntegrationStore {
  integrations: Integration[]
  providers: Provider[]
  loading: boolean
  error: string | null
  loadingStates: Record<string, boolean>
  debugInfo: any

  // Actions
  setLoading: (key: string, loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
  initializeProviders: () => Promise<void>
  fetchIntegrations: (force?: boolean) => Promise<void>
  connectIntegration: (providerId: string) => Promise<void>
  disconnectIntegration: (integrationId: string) => Promise<void>
  refreshAllTokens: () => Promise<void>
  getIntegrationStatus: (providerId: string) => string
  getIntegrationByProvider: (providerId: string) => Integration | null
  getConnectedProviders: () => string[]
  checkPendingConnection: () => void
}

export const useIntegrationStore = create<IntegrationStore>((set, get) => ({
  integrations: [],
  providers: [],
  loading: false,
  error: null,
  loadingStates: {},
  debugInfo: {},

  setLoading: (key: string, loading: boolean) =>
    set((state) => ({
      loadingStates: {
        ...state.loadingStates,
        [key]: loading,
      },
    })),

  setError: (error: string | null) => set({ error }),
  clearError: () => set({ error: null }),

  initializeProviders: async () => {
    try {
      set({ loading: true, error: null })

      // Add timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      const response = await fetch("/api/integrations/available", {
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch available integrations`)
      }

      const data = await response.json()

      // Handle the response structure from the API
      const providers = data.providers || []

      set({
        providers,
        loading: false,
      })

      console.log(
        "✅ Providers initialized:",
        providers.length,
        providers.map((p: Provider) => p.name),
      )
    } catch (error: any) {
      console.error("Failed to initialize providers:", error)

      // Fallback: Load integrations directly if API fails
      try {
        const { detectAvailableIntegrations } = await import("@/lib/integrations/availableIntegrations")
        const fallbackProviders = detectAvailableIntegrations()

        set({
          providers: fallbackProviders,
          loading: false,
          error: null,
        })

        console.log("✅ Fallback providers loaded:", fallbackProviders.length)
      } catch (fallbackError) {
        set({
          error: error.name === "AbortError" ? "Request timed out" : error.message,
          loading: false,
          providers: [], // Set empty array as fallback
        })
      }
    }
  },

  fetchIntegrations: async (force = false) => {
    const { loading } = get()
    if (loading && !force) return

    set({ loading: true, error: null })

    try {
      const supabase = getSupabaseClient()
      if (!supabase) throw new Error("Supabase client not available")

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        set({
          integrations: [],
          loading: false,
          error: "Please log in to view integrations",
        })
        return
      }

      // Add timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

      const response = await fetch("/api/integrations", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch integrations`)
      }

      const data = await response.json()

      set({
        integrations: Array.isArray(data.data) ? data.data : data.integrations || [],
        loading: false,
        debugInfo: data.debug || {},
      })

      console.log("✅ Integrations fetched:", data.data?.length || 0)
    } catch (error: any) {
      console.error("Failed to fetch integrations:", error)
      set({
        error: error.name === "AbortError" ? "Request timed out - please try again" : error.message,
        loading: false,
        integrations: [], // Set empty array as fallback
      })
    }
  },

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

      const supabase = getSupabaseClient()
      if (!supabase) throw new Error("Supabase client not available")

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error("No valid session found. Please log in again.")
      }

      const response = await fetch("/api/integrations/auth/generate-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
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
      console.log("OAuth response:", data)

      if (data.success && data.authUrl) {
        // Store connecting state in localStorage for persistence
        localStorage.setItem("connecting_provider", providerId)
        localStorage.setItem("connecting_timestamp", Date.now().toString())

        // Try popup first, fallback to redirect
        const popup = window.open(
          data.authUrl,
          "oauth_popup",
          "width=600,height=700,scrollbars=yes,resizable=yes,location=yes,menubar=no,toolbar=no,status=no",
        )

        if (!popup || popup.closed) {
          console.log("Popup blocked, redirecting to OAuth URL")
          // Fallback to redirect
          window.location.href = data.authUrl
          return
        }

        console.log(`✅ OAuth popup opened for ${providerId}`)

        // Enhanced popup monitoring
        let checkCount = 0
        const maxChecks = 600 // 5 minutes at 500ms intervals
        let messageReceived = false

        const checkClosed = setInterval(() => {
          checkCount++

          try {
            if (popup.closed) {
              clearInterval(checkClosed)
              console.log(`Popup closed for ${providerId}`)

              // Only clean up if no message was received
              if (!messageReceived) {
                setTimeout(() => {
                  const stillConnecting = localStorage.getItem("connecting_provider")
                  if (stillConnecting === providerId) {
                    console.log("No success callback received, cleaning up")
                    localStorage.removeItem("connecting_provider")
                    localStorage.removeItem("connecting_timestamp")
                    setLoading(`connect-${providerId}`, false)
                    // Refresh to check if connection actually succeeded
                    get().fetchIntegrations(true)
                  }
                }, 2000)
              }

              return
            }
          } catch (error) {
            console.error("Error checking popup:", error)
          }

          // Timeout after max checks
          if (checkCount >= maxChecks) {
            clearInterval(checkClosed)
            popup.close()
            if (!messageReceived) {
              localStorage.removeItem("connecting_provider")
              localStorage.removeItem("connecting_timestamp")
              setLoading(`connect-${providerId}`, false)
              set({ error: "Connection timed out. Please try again." })
            }
          }
        }, 500)

        // Listen for success/error messages with improved handling
        const messageHandler = (event: MessageEvent) => {
          console.log("Received message:", event.data, "from origin:", event.origin)

          // Accept messages from our own origin or any origin (for OAuth callbacks)
          const appUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || window.location.origin
          const expectedOrigin = new URL(appUrl).origin

          if (event.origin !== expectedOrigin && event.origin !== window.location.origin) {
            console.log("Message from unexpected origin, ignoring")
            return
          }

          if (event.data?.type === "oauth-success" && event.data?.provider === providerId) {
            console.log(`✅ OAuth success for ${providerId}`)
            messageReceived = true
            clearInterval(checkClosed)

            try {
              popup.close()
            } catch (e) {
              console.log("Popup already closed")
            }

            localStorage.removeItem("connecting_provider")
            localStorage.removeItem("connecting_timestamp")
            setLoading(`connect-${providerId}`, false)

            // Refresh integrations to show the new connection
            get().fetchIntegrations(true)

            window.removeEventListener("message", messageHandler)
          } else if (event.data?.type === "oauth-error" && event.data?.provider === providerId) {
            console.error(`❌ OAuth error for ${providerId}:`, event.data.error)
            messageReceived = true
            clearInterval(checkClosed)

            try {
              popup.close()
            } catch (e) {
              console.log("Popup already closed")
            }

            localStorage.removeItem("connecting_provider")
            localStorage.removeItem("connecting_timestamp")
            setLoading(`connect-${providerId}`, false)
            set({ error: event.data.error || `Failed to connect ${providerId}` })

            window.removeEventListener("message", messageHandler)
          }
        }

        window.addEventListener("message", messageHandler)

        // Cleanup after timeout
        setTimeout(() => {
          if (!messageReceived) {
            window.removeEventListener("message", messageHandler)
            clearInterval(checkClosed)
            try {
              popup.close()
            } catch (e) {
              console.log("Popup cleanup failed")
            }
            localStorage.removeItem("connecting_provider")
            localStorage.removeItem("connecting_timestamp")
            setLoading(`connect-${providerId}`, false)
          }
        }, 300000) // 5 minutes
      } else {
        throw new Error(data.error || "Failed to generate OAuth URL")
      }
    } catch (error: any) {
      console.error(`❌ Failed to connect ${providerId}:`, error)
      localStorage.removeItem("connecting_provider")
      localStorage.removeItem("connecting_timestamp")
      setLoading(`connect-${providerId}`, false)
      set({ error: error.message })
      throw error
    }
  },

  // Add this new method after connectIntegration
  checkPendingConnection: () => {
    const connectingProvider = localStorage.getItem("connecting_provider")
    const connectingTimestamp = localStorage.getItem("connecting_timestamp")

    if (connectingProvider && connectingTimestamp) {
      const elapsed = Date.now() - Number.parseInt(connectingTimestamp)

      // If less than 5 minutes, restore loading state
      if (elapsed < 300000) {
        console.log(`Restoring connection state for ${connectingProvider}`)
        get().setLoading(`connect-${connectingProvider}`, true)

        // Check for completion after a delay
        setTimeout(() => {
          get()
            .fetchIntegrations(true)
            .then(() => {
              const integration = get().getIntegrationByProvider(connectingProvider)
              if (integration?.status === "connected") {
                console.log(`Connection completed for ${connectingProvider}`)
                localStorage.removeItem("connecting_provider")
                localStorage.removeItem("connecting_timestamp")
                get().setLoading(`connect-${connectingProvider}`, false)
              }
            })
        }, 3000)
      } else {
        // Clean up old state
        localStorage.removeItem("connecting_provider")
        localStorage.removeItem("connecting_timestamp")
      }
    }
  },

  disconnectIntegration: async (integrationId: string) => {
    const { setLoading } = get()
    setLoading(`disconnect-${integrationId}`, true)

    try {
      const supabase = getSupabaseClient()
      if (!supabase) throw new Error("Supabase client not available")

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error("No valid session found. Please log in again.")
      }

      const response = await fetch(`/api/integrations/${integrationId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to disconnect integration")
      }

      await get().fetchIntegrations(true)
    } catch (error: any) {
      console.error(`Failed to disconnect integration:`, error)
      set({ error: error.message })
      throw error
    } finally {
      setLoading(`disconnect-${integrationId}`, false)
    }
  },

  refreshAllTokens: async () => {
    try {
      set({ loading: true, error: null })

      const supabase = getSupabaseClient()
      if (!supabase) throw new Error("Supabase client not available")

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error("No valid session found. Please log in again.")
      }

      const response = await fetch("/api/integrations/refresh-all-tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: session.user.id }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to refresh tokens")
      }

      const data = await response.json()
      await get().fetchIntegrations(true)

      return data
    } catch (error: any) {
      console.error("Failed to refresh tokens:", error)
      set({ error: error.message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  getIntegrationStatus: (providerId: string) => {
    const { integrations } = get()
    const integration = integrations.find((i) => i.provider === providerId)
    return integration?.status || "disconnected"
  },

  getIntegrationByProvider: (providerId: string) => {
    const { integrations } = get()
    return integrations.find((i) => i.provider === providerId) || null
  },

  getConnectedProviders: () => {
    const { integrations } = get()
    return integrations.filter((i) => i.status === "connected").map((i) => i.provider)
  },
}))
