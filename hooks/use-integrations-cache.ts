"use client"

import { useEffect, useCallback, useState } from "react"
import { 
  useIntegrationsStore, 
  loadIntegrationsOnce, 
  updateIntegration,
  addIntegration,
  removeIntegration,
  getIntegrationByProvider,
  Integration 
} from "@/stores/integrationCacheStore"
import { supabase } from "@/utils/supabaseClient"
import useCacheManager from "./use-cache-manager"

interface UseIntegrationsCacheReturn {
  integrations: Integration[] | null
  loading: boolean
  error: string | null
  refreshIntegrations: (forceRefresh?: boolean) => Promise<Integration[]>
  getByProvider: (provider: string) => Integration | null
  updateIntegrationStatus: (integrationId: string, status: string) => void
  disconnectIntegration: (integrationId: string, reason?: string) => Promise<void>
  connectingProvider: string | null
  connectIntegration: (provider: string) => Promise<void>
}

/**
 * Hook to work with cached integrations
 */
export function useIntegrationsCache(): UseIntegrationsCacheReturn {
  // Initialize cache manager for auth state changes
  useCacheManager()
  
  // Access store data
  const { data: integrations, loading, error } = useIntegrationsStore()
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null)
  
  // Helper to get the current user ID
  const getCurrentUserId = async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  }
  
  // Load integrations when needed
  const refreshIntegrations = useCallback(async (forceRefresh = false): Promise<Integration[]> => {
    const userId = await getCurrentUserId()
    if (!userId) return []
    
    return await loadIntegrationsOnce(userId, forceRefresh)
  }, [])
  
  // Get integration by provider name
  const getByProvider = useCallback((provider: string): Integration | null => {
    return getIntegrationByProvider(provider)
  }, [])
  
  // Update an integration's status
  const updateIntegrationStatus = useCallback((integrationId: string, status: string): void => {
    updateIntegration(integrationId, { 
      status, 
      updated_at: new Date().toISOString() 
    })
  }, [])
  
  // Disconnect an integration
  const disconnectIntegration = useCallback(async (integrationId: string, reason?: string): Promise<void> => {
    if (!supabase) return
    
    try {
      // Update in Supabase
      const { error } = await supabase
        .from("integrations")
        .update({
          status: "disconnected",
          disconnected_at: new Date().toISOString(),
          disconnect_reason: reason || "user_initiated"
        })
        .eq("id", integrationId)
      
      if (error) throw error
      
      // Update in store
      updateIntegration(integrationId, {
        status: "disconnected",
        disconnected_at: new Date().toISOString(),
        disconnect_reason: reason || "user_initiated"
      })
    } catch (err) {
      console.error("Error disconnecting integration:", err)
      throw err
    }
  }, [])
  
  // Connect a new integration
  const connectIntegration = useCallback(async (provider: string): Promise<void> => {
    if (!supabase) return
    
    try {
      setConnectingProvider(provider)
      
      // Here you would typically open an OAuth popup or redirect
      // For this example, we'll simulate the process
      
      const userId = await getCurrentUserId()
      if (!userId) throw new Error("User not authenticated")
      
      // In a real app, you'd handle OAuth and then add to the DB
      // This is a simplified example for illustration
      console.log(`Initiating connection flow for ${provider}...`)
      
      // After successful OAuth, you'd create an integration like this:
      /* 
      const newIntegration: Integration = {
        id: uuidv4(),
        user_id: userId,
        provider,
        status: "connected",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        lastRefreshTime: null
      }
      
      // Add to Supabase
      const { error } = await supabase.from("integrations").insert(newIntegration)
      if (error) throw error
      
      // Add to store
      addIntegration(newIntegration)
      */
    } catch (err) {
      console.error("Error connecting integration:", err)
      throw err
    } finally {
      setConnectingProvider(null)
    }
  }, [])
  
  // Initial load of integrations if needed
  useEffect(() => {
    if (integrations === null && !loading) {
      refreshIntegrations()
    }
  }, [integrations, loading, refreshIntegrations])
  
  return {
    integrations,
    loading,
    error,
    refreshIntegrations,
    getByProvider,
    updateIntegrationStatus,
    disconnectIntegration,
    connectingProvider,
    connectIntegration
  }
} 