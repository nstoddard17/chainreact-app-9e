import { create } from "zustand"

interface Integration {
  id: string
  name: string
  // ... other properties
}

interface Provider {
  id: string
  name: string
  // ... other properties
}

interface IntegrationState {
  integrations: Integration[]
  providers: Provider[]
  loading: boolean
  error: string | null
  cache: Map<string, any>
  lastFetch: Date | null
  fetchIntegrations: () => Promise<void>
  fetchProviders: () => Promise<void>
}

const initialState = {
  integrations: [],
  providers: [],
  loading: false,
  error: null,
  cache: new Map(),
  lastFetch: null,
}

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  ...initialState,
  fetchIntegrations: async () => {
    set({ loading: true, error: null })
    try {
      // Simulate API call
      const data = await new Promise<Integration[]>((resolve) => {
        setTimeout(() => {
          resolve([
            { id: "1", name: "Integration 1" },
            { id: "2", name: "Integration 2" },
          ])
        }, 500)
      })

      set({
        integrations: Array.isArray(data) ? data : [],
        loading: false,
        error: null,
      })
    } catch (error: any) {
      console.error("Failed to fetch integrations:", error)
      set({ integrations: [], loading: false, error: error.message })
      return
    }
  },
  fetchProviders: async () => {
    set({ loading: true, error: null })
    try {
      // Simulate API call
      const data = await new Promise<Provider[]>((resolve) => {
        setTimeout(() => {
          resolve([
            { id: "1", name: "Provider 1" },
            { id: "2", name: "Provider 2" },
          ])
        }, 500)
      })

      set({ providers: Array.isArray(data) ? data : [], loading: false, error: null })
    } catch (error: any) {
      console.error("Failed to fetch providers:", error)
      set({ providers: [], loading: false, error: error.message })
      return
    }
  },
}))
