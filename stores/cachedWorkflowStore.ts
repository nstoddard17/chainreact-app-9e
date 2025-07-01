import { createCacheStore, loadOnce, registerStore } from "./cacheStore"
import { supabase } from "@/utils/supabaseClient"
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
  if (!supabase) {
    throw new Error("Supabase client not available")
  }

  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", id)
    .single()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error("Workflow not found")
  }

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
  if (!supabase) {
    throw new Error("Supabase client not available")
  }

  const currentWorkflow = useCurrentWorkflowStore.getState().data
  
  if (!currentWorkflow || currentWorkflow.id !== id) {
    await loadWorkflow(id)
  }
  
  const updatedWorkflow = {
    ...currentWorkflow,
    ...updates,
    updated_at: new Date().toISOString()
  } as Workflow

  const { error } = await supabase
    .from("workflows")
    .update(updatedWorkflow)
    .eq("id", id)

  if (error) {
    throw error
  }

  // Update the current workflow store
  useCurrentWorkflowStore.getState().setData(updatedWorkflow)
  
  // Update the workflows list store
  const workflows = useWorkflowsListStore.getState().data || []
  const updatedWorkflows = workflows.map(w => 
    w.id === id ? updatedWorkflow : w
  )
  useWorkflowsListStore.getState().setData(updatedWorkflows)

  return updatedWorkflow
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(id: string): Promise<void> {
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