import { create } from "zustand"

interface Integration {
  id: string
  name: string
  type: string
  // Add other relevant properties
}

interface IntegrationState {
  integrations: Integration[]
  isLoading: boolean
  error: any | null
  fetchIntegrations: (forceRefresh?: boolean) => Promise<void>
  connectIntegration: (integrationData: any) => Promise<void>
  disconnectIntegration: (integrationId: string) => Promise<void>
}

const useIntegrationStore = create<IntegrationState>((set, get) => ({
  integrations: [],
  isLoading: false,
  error: null,
  fetchIntegrations: async (forceRefresh = false) => {
    if (!forceRefresh && get().integrations.length > 0) {
      return // Use cached data if available and not forced to refresh
    }

    set({ isLoading: true, error: null })
    try {
      const response = await fetch("/api/integrations")
      if (!response.ok) {
        throw new Error("Failed to fetch integrations")
      }
      const data = await response.json()
      set({ integrations: data, isLoading: false })
    } catch (error) {
      set({ error: error, isLoading: false })
    }
  },
  connectIntegration: async (integrationData: any) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(integrationData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to connect integration")
      }

      // Optimistically update the state (or refetch)
      get().fetchIntegrations(true)
      set({ isLoading: false })
    } catch (error) {
      console.error("Error connecting integration:", error)
      set({ error: error, isLoading: false })
      throw error // Re-throw to allow components to handle
    }
  },
  disconnectIntegration: async (integrationId: string) => {
    try {
      // Delete the integration record from the database
      const response = await fetch(`/api/integrations/${integrationId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to disconnect integration")
      }

      // Update the local state to reflect the disconnection
      set((state) => ({
        integrations: state.integrations.filter((integration) => integration.id !== integrationId),
      }))

      // Refresh the integrations list to ensure UI is up to date
      get().fetchIntegrations(true)
    } catch (error) {
      console.error("Error disconnecting integration:", error)
      throw error
    }
  },
}))

export { useIntegrationStore }
export default useIntegrationStore
