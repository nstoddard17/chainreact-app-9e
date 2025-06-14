import { create } from "zustand"
import { apiClient } from "../lib/apiClient"

export type Integration = {
  id: string
  name: string
  type: string
  status: string
  // Add other integration properties here
}

type IntegrationState = {
  integrations: Integration[]
  loading: boolean
  error: string | null
  lastFetch: number | null
  fetchIntegrations: (skipCache?: boolean) => Promise<Integration[]>
}

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  integrations: [],
  loading: false,
  error: null,
  lastFetch: null,
  fetchIntegrations: async (skipCache = false) => {
    const state = get()

    // Return cached data if available and not skipping cache
    if (!skipCache && state.integrations.length > 0 && !state.error) {
      return state.integrations
    }

    set({ loading: true, error: null })

    try {
      const { data, error } = await apiClient.get<Integration[]>("/api/integrations")

      if (error) {
        console.warn("Failed to fetch integrations:", error)
        set({
          integrations: [], // Empty array instead of null
          loading: false,
          error: "Failed to load integrations",
        })
        return []
      }

      const integrations = data || []
      set({
        integrations,
        loading: false,
        error: null,
        lastFetch: Date.now(),
      })

      return integrations
    } catch (error) {
      console.error("Error fetching integrations:", error)
      set({
        integrations: [], // Empty array instead of null
        loading: false,
        error: "Network error while loading integrations",
      })
      return []
    }
  },
}))
