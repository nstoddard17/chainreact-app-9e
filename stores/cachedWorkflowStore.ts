import { createCacheStore, loadOnce, registerStore } from "./cacheStore"
import { createClient } from "@/utils/supabaseClient"
import { v4 as uuidv4 } from "uuid"

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
  status?: string
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
    .select("id, name, description, nodes, connections, created_at, updated_at, user_id, status")
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
      checkStale: () => useWorkflowsListStore.getState().isStale(5 * 60 * 1000) // 5 minutes
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

  const newWorkflow: Workflow = {
    id: uuidv4(),
    name,
    description: description || "",
    nodes: [],
    connections: [],
    user_id: user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from("workflows").insert(newWorkflow)

  if (error) {
    throw error
  }

  // Update the workflows list store
  const currentWorkflows = useWorkflowsListStore.getState().data || []
  useWorkflowsListStore.getState().setData([newWorkflow, ...currentWorkflows])
  
  // Set as current workflow
  useCurrentWorkflowStore.getState().setData(newWorkflow)

  return newWorkflow
}

/**
 * Update a workflow
 */
export async function updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
  const supabase = createClient()
  if (!supabase) {
    throw new Error("Supabase client not available")
  }

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
  
  // Prepare the update data
  const updateData = {
    ...updates,
    updated_at: new Date().toISOString()
  }

  // If we have the current workflow, merge it with updates
  if (currentWorkflow) {
    Object.assign(updateData, currentWorkflow, updates)
  }

  const { data: savedData, error } = await supabase
    .from("workflows")
    .update(updateData)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    throw error
  }
  
  console.log("✅ Workflow status updated:", {
    id: savedData.id,
    status: savedData.status,
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
    throw error
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
} 