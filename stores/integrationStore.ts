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

      const response = await fetch("/api/integrations/available")
      if (!response.ok) {
        throw new Error("Failed to fetch available integrations")
      }

      const data = await response.json()
      set({
        providers: data.providers || [],
        loading: false,
      })
    } catch (error: any) {
      console.error("Failed to initialize providers:", error)
      set({
        error: error.message,
        loading: false,
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
        throw new Error("No valid session found. Please log in again.")
      }

      const response = await fetch("/api/integrations", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to fetch integrations")
      }

      const data = await response.json()

      set({
        integrations: data.integrations || [],
        loading: false,
        debugInfo: data.debug || {},
      })
    } catch (error: any) {
      console.error("Failed to fetch integrations:", error)
      set({
        error: error.message,
        loading: false,
      })
    }
  },

  connectIntegration: (providerId: string) => {
    return new Promise<void>(async (resolve, reject) => {
      const { setLoading, providers } = get()
      const provider = providers.find((p) => p.id === providerId)

      if (!provider) return reject(new Error(`Provider ${providerId} not found`))
      if (!provider.isAvailable) return reject(new Error(`${provider.name} integration not configured.`))

      setLoading(`connect-${providerId}`, true)

      try {
        const supabase = getSupabaseClient()
        if (!supabase) throw new Error("Supabase client not available")

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session?.access_token) throw new Error("No valid session found.")

        const res = await fetch("/api/integrations/auth/generate-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ provider: providerId }),
        })

        const data = await res.json()
        if (!res.ok || !data.success) throw new Error(data.error || "Failed to generate OAuth URL")

        const popup = window.open(data.authUrl, "_blank", "width=600,height=700,scrollbars=yes,resizable=yes")
        if (!popup) throw new Error("Popup blocked.")

        let closedByMessage = false

        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed)
            window.removeEventListener("message", messageHandler)

            if (!closedByMessage) {
              setLoading(`connect-${providerId}`, false)
              get()
                .fetchIntegrations(true)
                .finally(() => resolve())
            }
          }
        }, 100)

        const messageHandler = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return
          if (event.data?.provider !== providerId) return

          closedByMessage = true
          clearInterval(checkClosed)
          window.removeEventListener("message", messageHandler)
          popup.close()

          if (event.data.type === "oauth-success") {
            setLoading(`connect-${providerId}`, false)
            get()
              .fetchIntegrations(true)
              .finally(() => resolve())
          } else if (event.data.type === "oauth-error") {
            set({ error: event.data.error || `Failed to connect ${providerId}` })
            setLoading(`connect-${providerId}`, false)
            resolve()
          }
        }

        window.addEventListener("message", messageHandler)

        setTimeout(() => {
          if (!popup.closed) {
            clearInterval(checkClosed)
            popup.close()
            window.removeEventListener("message", messageHandler)
          }
          setLoading(`connect-${providerId}`, false)
          resolve()
        }, 300000)
      } catch (err: any) {
        set({ error: err.message })
        setLoading(`connect-${providerId}`, false)
        reject(err)
      }
    })
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
