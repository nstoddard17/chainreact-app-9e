"use client"

import { useEffect, useState } from "react"
import { createCacheStore, loadOnce, registerStore } from "@/stores/cacheStore"
import { supabase } from "@/utils/supabaseClient"
import useCacheManager from "@/hooks/use-cache-manager"

// Define interfaces for our data
interface Integration {
  id: string
  provider: string
  status: string
  updated_at: string
}

interface Workflow {
  id: string
  name: string
  created_at: string
}

// Create cache stores
const useIntegrationsCache = createCacheStore<Integration[]>("integrations")
const useWorkflowsCache = createCacheStore<Workflow[]>("workflows")

// Register stores for auth-based clearing
registerStore({
  clearData: () => useIntegrationsCache.getState().clearData()
})

registerStore({
  clearData: () => useWorkflowsCache.getState().clearData()
})

// Fetch functions
async function fetchIntegrations(): Promise<Integration[]> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }
  
  const { data, error } = await supabase
    .from('integrations')
    .select('id, provider, status, updated_at')
    .eq('user_id', user.id)
    
  if (error) {
    throw error
  }
  
  return data || []
}

async function fetchWorkflows(): Promise<Workflow[]> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error("Not authenticated")
  }
  
  const { data, error } = await supabase
    .from('workflows')
    .select('id, name, created_at')
    .eq('user_id', user.id)
    
  if (error) {
    throw error
  }
  
  return data || []
}

// Helper load functions
async function loadIntegrations(forceRefresh = false) {
  return loadOnce({
    getter: () => useIntegrationsCache.getState().data,
    setter: (data) => useIntegrationsCache.getState().setData(data),
    fetcher: fetchIntegrations,
    options: {
      forceRefresh,
      setLoading: (loading) => useIntegrationsCache.getState().setLoading(loading),
      onError: (error) => useIntegrationsCache.getState().setError(error.message),
      checkStale: () => useIntegrationsCache.getState().isStale(10 * 60 * 1000) // 10 minutes
    }
  })
}

async function loadWorkflows(forceRefresh = false) {
  return loadOnce({
    getter: () => useWorkflowsCache.getState().data,
    setter: (data) => useWorkflowsCache.getState().setData(data),
    fetcher: fetchWorkflows,
    options: {
      forceRefresh,
      setLoading: (loading) => useWorkflowsCache.getState().setLoading(loading),
      onError: (error) => useWorkflowsCache.getState().setError(error.message),
      // Example of custom stale check
      checkStale: () => {
        const { lastFetched } = useWorkflowsCache.getState()
        // Consider workflows stale after 5 minutes
        return !lastFetched || (Date.now() - lastFetched > 5 * 60 * 1000)
      }
    }
  })
}

export function CachedDataExample() {
  // Initialize cache manager for auth state changes
  useCacheManager()
  
  // Get data from stores
  const { 
    data: integrations, 
    loading: integrationsLoading, 
    error: integrationsError,
    isStale: integrationsIsStale
  } = useIntegrationsCache()
  
  const {
    data: workflows,
    loading: workflowsLoading,
    error: workflowsError,
    isStale: workflowsIsStale
  } = useWorkflowsCache()
  
  // Track when data was loaded
  const [dataLoaded, setDataLoaded] = useState(false)
  
  // Load data on mount if needed
  useEffect(() => {
    async function loadData() {
      try {
        await Promise.all([
          loadIntegrations(),
          loadWorkflows()
        ])
        setDataLoaded(true)
      } catch (error) {
        console.error("Error loading cached data:", error)
      }
    }
    
    loadData()
  }, [])
  
  // Refresh all data
  const refreshAllData = async () => {
    try {
      await Promise.all([
        loadIntegrations(true),
        loadWorkflows(true)
      ])
    } catch (error) {
      console.error("Error refreshing data:", error)
    }
  }
  
  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Cached Data Example</h2>
        <button
          onClick={refreshAllData}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Refresh All Data
        </button>
      </div>
      
      {/* Integrations Section */}
      <div className="border rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Integrations</h3>
          <div className="text-sm">
            {integrationsIsStale() && <span className="text-amber-600 mr-2">⚠️ Stale</span>}
            {integrationsLoading && <span className="text-blue-600">Loading...</span>}
          </div>
        </div>
        
        {integrationsError ? (
          <div className="text-red-500">Error: {integrationsError}</div>
        ) : integrations && integrations.length > 0 ? (
          <ul className="space-y-2">
            {integrations.map((integration) => (
              <li key={integration.id} className="p-2 bg-gray-50 rounded">
                {integration.provider} - {integration.status}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-gray-500">No integrations found</div>
        )}
      </div>
      
      {/* Workflows Section */}
      <div className="border rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Workflows</h3>
          <div className="text-sm">
            {workflowsIsStale() && <span className="text-amber-600 mr-2">⚠️ Stale</span>}
            {workflowsLoading && <span className="text-blue-600">Loading...</span>}
          </div>
        </div>
        
        {workflowsError ? (
          <div className="text-red-500">Error: {workflowsError}</div>
        ) : workflows && workflows.length > 0 ? (
          <ul className="space-y-2">
            {workflows.map((workflow) => (
              <li key={workflow.id} className="p-2 bg-gray-50 rounded">
                {workflow.name}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-gray-500">No workflows found</div>
        )}
      </div>
      
      {/* Cache Status */}
      <div className="text-sm text-gray-500">
        {dataLoaded ? (
          <p>Data loaded from {integrationsIsStale() || workflowsIsStale() ? 'API' : 'cache'}</p>
        ) : (
          <p>Loading data...</p>
        )}
      </div>
    </div>
  )
} 