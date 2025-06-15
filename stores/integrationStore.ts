import { create } from "zustand"
import { getSupabaseClient } from "@/lib/supabase"

export interface Integration {
  id: string
  name: string
  description: string
  icon: string
  category: string
  isConnected: boolean
  isAvailable: boolean
  connectedAt?: string
  lastSync?: string
  status: "connected" | "disconnected" | "error" | "syncing"
  scopes?: string[]
  requiredScopes?: string[]
  scopesValid?: boolean
}

export interface IntegrationStore {
  integrations: Integration[]
  providers: Integration[]
  loading: boolean
  error: string | null
  loadingStates: Record<string, boolean>

  // Actions
  setLoading: (key: string, loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
  fetchIntegrations: (force?: boolean) => Promise<void>
  connectIntegration: (providerId: string) => Promise<void>
  disconnectIntegration: (providerId: string) => Promise<void>
  refreshIntegration: (providerId: string) => Promise<void>
}

export const useIntegrationStore = create<IntegrationStore>((set, get) => ({
  integrations: [],
  providers: [],
  loading: false,
  error: null,
  loadingStates: {},

  setLoading: (key: string, loading: boolean) =>
    set((state) => ({
      loadingStates: {
        ...state.loadingStates,
        [key]: loading,
      },
    })),

  setError: (error: string | null) => set({ error }),
  clearError: () => set({ error: null }),

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
        providers: data.providers || [],
        loading: false,
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
        }, 100) // Reduced from 500ms to 100ms for faster response

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
        }, 300000) // 5 min timeout
      } catch (err: any) {
        set({ error: err.message })
        setLoading(`connect-${providerId}`, false)
        reject(err)
      }
    })
  },

  disconnectIntegration: async (providerId: string) => {
    const { setLoading } = get()
    setLoading(`disconnect-${providerId}`, true)

    try {
      const supabase = getSupabaseClient()
      if (!supabase) throw new Error("Supabase client not available")

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error("No valid session found. Please log in again.")
      }

      const response = await fetch(`/api/integrations/${providerId}`, {
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
      console.error(`Failed to disconnect ${providerId}:`, error)
      set({ error: error.message })
      throw error
    } finally {
      setLoading(`disconnect-${providerId}`, false)
    }
  },

  refreshIntegration: async (providerId: string) => {
    const { setLoading } = get()
    setLoading(`refresh-${providerId}`, true)

    try {
      const supabase = getSupabaseClient()
      if (!supabase) throw new Error("Supabase client not available")

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error("No valid session found. Please log in again.")
      }

      const response = await fetch(`/api/integrations/${providerId}/refresh`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to refresh integration")
      }

      await get().fetchIntegrations(true)
    } catch (error: any) {
      console.error(`Failed to refresh ${providerId}:`, error)
      set({ error: error.message })
      throw error
    } finally {
      setLoading(`refresh-${providerId}`, false)
    }
  },
}))
