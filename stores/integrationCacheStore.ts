import { createCacheStore, loadOnce, registerStore } from "./cacheStore"
import { supabase } from "@/utils/supabaseClient"

// Define the integration interface
export interface Integration {
  id: string
  user_id: string
  provider: string
  status: string
  access_token?: string
  refresh_token?: string
  created_at: string
  updated_at: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
  disconnected_at?: string | null
  disconnect_reason?: string | null
  lastRefreshTime: string | null
}

// Create the integrations cache store
export const useIntegrationsStore = createCacheStore<Integration[]>("userIntegrations")

// Register the store for auth-based clearing
registerStore({
  clearData: () => useIntegrationsStore.getState().clearData()
})

/**
 * Fetch integrations for a specific user from Supabase
 */
async function fetchIntegrations(userId: string): Promise<Integration[]> {
  if (!userId) {
    throw new Error("User ID is required to fetch integrations")
  }

  if (!supabase) {
    throw new Error("Supabase client not available")
  }

  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })

  if (error) {
    throw error
  }

  return data || []
}

/**
 * Load integrations with caching
 * @param userId The ID of the user to load integrations for
 * @param forceRefresh Whether to force a refresh regardless of cache state
 * @returns Array of integrations
 */
export async function loadIntegrationsOnce(userId: string, forceRefresh = false): Promise<Integration[]> {
  // Return early if no userId is provided
  if (!userId) {
    return []
  }

  const result = await loadOnce({
    getter: () => useIntegrationsStore.getState().data,
    setter: (data) => useIntegrationsStore.getState().setData(data),
    fetcher: () => fetchIntegrations(userId),
    options: {
      forceRefresh,
      setLoading: (loading) => useIntegrationsStore.getState().setLoading(loading),
      onError: (error) => useIntegrationsStore.getState().setError(error.message),
      // Consider integrations stale after 5 minutes
      checkStale: () => useIntegrationsStore.getState().isStale(5 * 60 * 1000)
    }
  })

  return result || []
}

/**
 * Update a specific integration in the store
 * @param integrationId The ID of the integration to update
 * @param updates The updates to apply
 */
export function updateIntegration(integrationId: string, updates: Partial<Integration>): void {
  const integrations = useIntegrationsStore.getState().data
  
  if (!integrations) return
  
  const updatedIntegrations = integrations.map(integration => 
    integration.id === integrationId 
      ? { ...integration, ...updates } 
      : integration
  )
  
  useIntegrationsStore.getState().setData(updatedIntegrations)
}

/**
 * Add a new integration to the store
 * @param integration The integration to add
 */
export function addIntegration(integration: Integration): void {
  const integrations = useIntegrationsStore.getState().data || []
  useIntegrationsStore.getState().setData([integration, ...integrations])
}

/**
 * Remove an integration from the store
 * @param integrationId The ID of the integration to remove
 */
export function removeIntegration(integrationId: string): void {
  const integrations = useIntegrationsStore.getState().data
  
  if (!integrations) return
  
  const updatedIntegrations = integrations.filter(
    integration => integration.id !== integrationId
  )
  
  useIntegrationsStore.getState().setData(updatedIntegrations)
}

/**
 * Get integration by provider
 * @param provider The provider name to search for
 * @returns The integration if found, or null
 */
export function getIntegrationByProvider(provider: string): Integration | null {
  const integrations = useIntegrationsStore.getState().data
  
  if (!integrations) return null
  
  return integrations.find(integration => 
    integration.provider === provider && integration.status === 'connected'
  ) || null
} 