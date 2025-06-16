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
        throw new Error("Failed to fetch available integrations")
      }

      const data = await response.json()

      // Ensure we have valid data structure
      const providers = Array.isArray(data)
        ? data
        : data.data?.integrations || data.integrations || data.providers || []

      set({
        providers,
        loading: false,
      })

      console.log("✅ Providers initialized:", providers.length)
    } catch (error: any) {
      console.error("Failed to initialize providers:", error)
      set({
        error: error.name === "AbortError" ? "Request timed out" : error.message,
        loading: false,
        providers: [], // Set empty array as fallback
      })
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

      if (data.success && data.authUrl) {
        const popup = window.open(data.authUrl, "_blank", "width=600,height=700,scrollbars=yes,resizable=yes")
        if (!popup) throw new Error("Popup blocked. Please allow popups for this site.")

        console.log(`✅ OAuth popup opened for ${providerId}`)

        let closedByMessage = false

        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed)
            window.removeEventListener("message", messageHandler)

            if (!closedByMessage) {
              console.log(`❌ Popup closed manually for ${providerId}`)
              setLoading(`connect-${providerId}`, false)
              get().fetchIntegrations(true)
            }
          }
        }, 500)

        const messageHandler = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return
          if (event.data?.provider !== providerId) return

          closedByMessage = true
          clearInterval(checkClosed)
          window.removeEventListener("message", messageHandler)

          popup.close()

          if (event.data?.type === "oauth-success") {
            console.log(`✅ OAuth success for ${providerId}`)
            setLoading(`connect-${providerId}`, false)
            get().fetchIntegrations(true)
          } else if (event.data?.type === "oauth-error") {
            console.error(`❌ OAuth error for ${providerId}:`, event.data.error)
            setLoading(`connect-${providerId}`, false)
            set({ error: event.data.error || `Failed to connect ${providerId}` })
          }
        }

        window.addEventListener("message", messageHandler)

        // Final cleanup after 5 minutes in case of nothing happening
        setTimeout(() => {
          if (!popup.closed) {
            clearInterval(checkClosed)
            popup.close()
          }
          window.removeEventListener("message", messageHandler)
          setLoading(`connect-${providerId}`, false)
        }, 300000) // 5 minutes
      } else {
        throw new Error(data.error || "Failed to generate OAuth URL")
      }
    } catch (error: any) {
      console.error(`❌ Failed to connect ${providerId}:`, error)
      set({ error: error.message })
      throw error
    } finally {
      // No-op here — handled dynamically when popup closes
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
