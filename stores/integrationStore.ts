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
  authType?: "oauth" | "apiKey"
}

export interface IntegrationStore {
  integrations: Integration[]
  providers: Provider[]
  loading: boolean
  error: string | null
  loadingStates: Record<string, boolean>
  debugInfo: any
  globalPreloadingData: boolean
  preloadStarted: boolean

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
  initializeGlobalPreload: () => Promise<void>
  clearAllData: () => void
  connectApiKeyIntegration: (providerId: string, apiKey: string) => Promise<void>
}

export const useIntegrationStore = create<IntegrationStore>((set, get) => ({
  integrations: [],
  providers: [],
  loading: false,
  error: null,
  loadingStates: {},
  debugInfo: {},
  globalPreloadingData: false,
  preloadStarted: false,

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

      const providers = Array.isArray(data) ? data : data.data?.integrations || data.integrations || data.providers || []

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
        providers: [],
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

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

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
        integrations: [],
      })
    }
  },

  connectIntegration: async (providerId: string) => {
    const { setLoading, providers, setError } = get()
    const provider = providers.find((p) => p.id === providerId)

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`)
    }

    if (!provider.isAvailable) {
      throw new Error(`${provider.name} integration is not configured. Missing environment variables.`)
    }

    setLoading(`connect-${providerId}`, true)
    setError(null)

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

        const messageHandler = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return

          if (event.data?.type === "oauth-success" && event.data?.provider === providerId) {
            console.log(`✅ OAuth successful for ${providerId}`)
            closedByMessage = true
            popup.close()
            get().fetchIntegrations(true)
            window.removeEventListener("message", messageHandler)
          } else if (event.data?.type === "oauth-error" && event.data?.provider === providerId) {
            console.error(`❌ OAuth error for ${providerId}:`, event.data.error)
            setError(`Connection failed: ${event.data.error || "Unknown error."}`)
            closedByMessage = true
            popup.close()
            window.removeEventListener("message", messageHandler)
          }
        }

        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed)
            window.removeEventListener("message", messageHandler)

            if (!closedByMessage) {
              console.log(`❌ Popup closed manually for ${providerId}`)
              setError("Popup closed before completing authorization.")
            }
          }
        }, 500)

        window.addEventListener("message", messageHandler)
      } else {
        throw new Error(data.error || "Could not retrieve authorization URL.")
      }
    } catch (error: any) {
      console.error(`Failed to connect ${providerId}:`, error)
      setError(error.message)
    } finally {
      setLoading(`connect-${providerId}`, false)
    }
  },

  connectApiKeyIntegration: async (providerId: string, apiKey: string) => {
    const { setLoading, fetchIntegrations, setError } = get()
    setLoading(`connect-${providerId}`, true)
    setError(null)

    try {
      const supabase = getSupabaseClient()
      if (!supabase) throw new Error("Supabase client not available")

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error("No valid session found. Please log in again.")
      }

      const response = await fetch("/api/integrations/token-management", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          provider: providerId,
          apiKey: apiKey,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to save API key")
      }

      console.log(`✅ API key connected for ${providerId}`)
      await fetchIntegrations(true)
    } catch (error: any) {
      console.error(`Failed to connect ${providerId}:`, error)
      setError(error.message)
    } finally {
      setLoading(`connect-${providerId}`, false)
    }
  },

  disconnectIntegration: async (integrationId: string) => {
    const { setLoading, fetchIntegrations, integrations, setError } = get()
    const integration = integrations.find((i) => i.id === integrationId)

    if (integration) {
      setLoading(`disconnect-${integration.provider}`, true)
    } else {
      // Fallback if integration not found in store
      setLoading(`disconnect-${integrationId}`, true)
    }
    setError(null)

    try {
      const supabase = getSupabaseClient()
      if (!supabase) throw new Error("Supabase client not available")

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error("Not authenticated")

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

      console.log(`✅ Integration ${integrationId} disconnected`)
      await fetchIntegrations(true)
    } catch (error: any) {
      console.error(`Failed to disconnect integration:`, error)
      setError(error.message)
    } finally {
      if (integration) {
        setLoading(`disconnect-${integration.provider}`, false)
      } else {
        setLoading(`disconnect-${integrationId}`, false)
      }
    }
  },

  refreshAllTokens: async () => {
    const { setLoading, setError, fetchIntegrations } = get()
    setLoading("refresh-all", true)
    setError(null)

    try {
      const response = await fetch("/api/integrations/refresh-tokens", { method: "POST" })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to refresh tokens")
      }
      console.log("✅ All tokens refreshed successfully")
      await fetchIntegrations(true)
    } catch (error: any) {
      console.error("Failed to refresh tokens:", error)
      setError(error.message)
    } finally {
      setLoading("refresh-all", false)
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

  initializeGlobalPreload: async () => {
    const { initializeProviders, fetchIntegrations, preloadStarted } = get()
    if (preloadStarted) return
    set({ globalPreloadingData: true, preloadStarted: true })

    try {
      await Promise.all([initializeProviders(), fetchIntegrations()])
    } catch (error) {
      console.error("Error during global preload:", error)
      get().setError("Failed to load initial data.")
    } finally {
      set({ globalPreloadingData: false })
    }
  },

  clearAllData: () => {
    set({
      integrations: [],
      providers: [],
      loading: false,
      error: null,
      loadingStates: {},
      debugInfo: {},
      globalPreloadingData: false,
      preloadStarted: false,
    })
  },
}))
