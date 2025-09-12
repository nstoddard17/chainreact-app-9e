import { createCacheStore, loadOnce, registerStore } from "./cacheStore"
import { createClient } from "@/utils/supabaseClient"

// Define interfaces for workflow data
export interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, any>
  width?: number
  height?: number
}

export interface Workflow {
  id: string
  name: string
  description?: string
  nodes: WorkflowNode[]
  connections: any[]
  created_at?: string
  updated_at?: string
  user_id?: string
  organization_id?: string | null
  status?: string
  visibility?: string
  executions_count?: number
  created_by?: string
}

// Create cache stores for workflow data
export const useWorkflowsListStore = createCacheStore<Workflow[]>("workflowsList")
export const useCurrentWorkflowStore = createCacheStore<Workflow>("currentWorkflow")

// Register stores for auth-based clearing
registerStore({
  clearData: () => useWorkflowsListStore.getState().clearData()
})

registerStore({
  clearData: () => useCurrentWorkflowStore.getState().clearData()
})

/**
 * Fetch all workflows for the current user
 */
async function fetchWorkflows(): Promise<Workflow[]> {
  const supabase = createClient()
  if (!supabase) {
    throw new Error("Supabase client not available")
  }

  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .order("updated_at", { ascending: false })

  if (error) {
    throw error
  }

  return data || []
}

/**
 * Fetch a single workflow by ID
 */
async function fetchWorkflow(id: string): Promise<Workflow> {
  const supabase = createClient()
  if (!supabase) {
    throw new Error("Supabase client not available")
  }

  // Explicitly select all fields including nodes and connections
  const { data, error } = await supabase
    .from("workflows")
    .select("id, name, description, nodes, connections, created_at, updated_at, user_id, organization_id, status")
    .eq("id", id)
    .single()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error("Workflow not found")
  }
  
  // Log the loaded workflow data to verify positions
  console.log("🔍 Workflow loaded from database:", {
    id: data.id,
    name: data.name,
    nodesCount: data.nodes?.length || 0,
    connectionsCount: data.connections?.length || 0,
    nodePositions: data.nodes?.map((n: WorkflowNode) => ({ 
      id: n.id, 
      position: n.position 
    }))
  });

  return data
}

/**
 * Load all workflows with caching
 */
export async function loadWorkflows(forceRefresh = false): Promise<Workflow[]> {
  const result = await loadOnce({
    getter: () => useWorkflowsListStore.getState().data,
    setter: (data) => useWorkflowsListStore.getState().setData(data),
    fetcher: fetchWorkflows,
    options: {
      forceRefresh,
      setLoading: (loading) => useWorkflowsListStore.getState().setLoading(loading),
      onError: (error) => useWorkflowsListStore.getState().setError(error.message),
      checkStale: () => useWorkflowsListStore.getState().isStale(10 * 60 * 1000) // 10 minutes - increased cache time
    }
  })

  return result || []
}

/**
 * Load a single workflow with caching
 */
export async function loadWorkflow(id: string, forceRefresh = false): Promise<Workflow | null> {
  const result = await loadOnce({
    getter: () => {
      const current = useCurrentWorkflowStore.getState().data
      return current?.id === id ? current : null
    },
    setter: (data) => useCurrentWorkflowStore.getState().setData(data),
    fetcher: () => fetchWorkflow(id),
    options: {
      forceRefresh,
      setLoading: (loading) => useCurrentWorkflowStore.getState().setLoading(loading),
      onError: (error) => useCurrentWorkflowStore.getState().setError(error.message)
    }
  })

  return result
}

/**
 * Create a new workflow
 */
export async function createWorkflow(name: string, description?: string): Promise<Workflow> {
  const supabase = createClient()
  if (!supabase) {
    throw new Error("Supabase client not available")
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error("User not authenticated")
  }

  // Don't include ID - let the database generate it
  // Also don't include timestamps - let the database handle them
  const newWorkflow = {
    name,
    description: description || "",
    nodes: [], // Will be JSON in database
    connections: [], // Will be JSON in database  
    user_id: user.id,
    status: "draft", // Add required status field
    // executions_count will be handled by database default value
  }

  console.log("Creating workflow with data:", newWorkflow)

  const { data, error } = await supabase
    .from("workflows")
    .insert(newWorkflow)
    .select()
    .single()

  if (error) {
    console.error("Failed to create workflow:", error)
    console.error("Error details:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    })
    
    // Provide more specific error messages based on error code
    if (error.code === '23505') { // Unique violation - but this should not happen for workflow names
      // Since we allow duplicate names, this would be for a different unique constraint
      throw new Error("A unique constraint was violated. Please try again.")
    } else if (error.code === '23503') { // Foreign key violation
      throw new Error("Invalid user reference. Please try logging in again.")
    } else if (error.code === '23502') { // Not null violation
      throw new Error("Missing required fields. Please fill in all required information.")
    }
    
    throw new Error(error.message || "Failed to create workflow")
  }

  if (!data) {
    throw new Error("No data returned from workflow creation")
  }

  // Update the workflows list store with the actual saved data
  const currentWorkflows = useWorkflowsListStore.getState().data || []
  useWorkflowsListStore.getState().setData([data, ...currentWorkflows])
  
  // Set as current workflow
  useCurrentWorkflowStore.getState().setData(data)

  return data
}

/**
 * Update a workflow
 */
export async function updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
  const supabase = createClient()
  if (!supabase) {
    throw new Error("Supabase client not available")
  }

  console.log(`📝 Starting workflow update for ${id}`)

  // Get the current workflow from the store
  let currentWorkflow = useCurrentWorkflowStore.getState().data
  
  // If the current workflow is not the one we're updating, load it first
  if (!currentWorkflow || currentWorkflow.id !== id) {
    try {
      currentWorkflow = await loadWorkflow(id)
    } catch (error) {
      console.error("Failed to load workflow for update:", error)
      // If we can't load the workflow, we'll update with just the provided updates
      currentWorkflow = null
    }
  }
  
  // Prepare the update data - only send the fields we're actually updating
  const updateData = {
    ...updates,
    updated_at: new Date().toISOString()
  }

  console.log(`📤 Sending update to Supabase for workflow ${id}`, {
    hasNodes: 'nodes' in updateData,
    nodesCount: updateData.nodes?.length,
    hasConnections: 'connections' in updateData,
    connectionsCount: updateData.connections?.length,
    name: updateData.name
  })

  // Create a timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Supabase update timed out after 30 seconds")), 30000)
  })

  // Race between the update and the timeout
  const updatePromise = supabase
    .from("workflows")
    .update(updateData)
    .eq("id", id)
    .select()
    .single()

  try {
    const { data: savedData, error } = await Promise.race([updatePromise, timeoutPromise]) as any

    if (error) {
      console.error(`❌ Supabase update failed for workflow ${id}:`, error)
      throw error
    }
    
    console.log("✅ Workflow updated successfully:", {
      id: savedData.id,
      name: savedData.name,
      status: savedData.status,
      nodesCount: savedData.nodes?.length,
      connectionsCount: savedData.connections?.length,
      updated_at: savedData.updated_at
    })

    // Update the current workflow store with the actual saved data from database
    useCurrentWorkflowStore.getState().setData(savedData)
    
    // Update the workflows list store with the actual saved data
    const workflows = useWorkflowsListStore.getState().data || []
    const updatedWorkflows = workflows.map(w => 
      w.id === id ? savedData : w
    )
    useWorkflowsListStore.getState().setData(updatedWorkflows)

    return savedData
  } catch (error) {
    console.error(`❌ Failed to update workflow ${id}:`, error)
    throw error
  }
}

/**
 * Force clear cache for a specific workflow
 */
export function clearWorkflowCache(id: string): void {
  const currentWorkflow = useCurrentWorkflowStore.getState().data
  if (currentWorkflow?.id === id) {
    useCurrentWorkflowStore.getState().clearData()
  }
  
  // Also clear from workflows list cache
  const workflows = useWorkflowsListStore.getState().data || []
  const updatedWorkflows = workflows.filter(w => w.id !== id)
  useWorkflowsListStore.getState().setData(updatedWorkflows)
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(id: string): Promise<void> {
  const supabase = createClient()
  if (!supabase) {
    throw new Error("Supabase client not available")
  }

  const { error } = await supabase
    .from("workflows")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Failed to delete workflow:", error)
    throw new Error(error.message || "Failed to delete workflow")
  }

  // Clear current workflow if it's the one being deleted
  const currentWorkflow = useCurrentWorkflowStore.getState().data
  if (currentWorkflow?.id === id) {
    useCurrentWorkflowStore.getState().clearData()
  }
  
  // Update the workflows list store
  const workflows = useWorkflowsListStore.getState().data || []
  const updatedWorkflows = workflows.filter(w => w.id !== id)
  useWorkflowsListStore.getState().setData(updatedWorkflows)
  
  // Clear saved configurations for this workflow
  if (typeof window !== "undefined") {
    try {
      // Import dynamically to avoid SSR issues
      import("@/lib/workflows/configPersistence").then(({ clearWorkflowConfigs }) => {
        clearWorkflowConfigs(id)
        console.log(`✅ Cleared saved configurations for deleted workflow: ${id}`)
      })
    } catch (error) {
      console.error("Failed to clear saved configurations:", error)
    }
  }
} 