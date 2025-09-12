import { useEffect, useState, useCallback } from 'react'
import { 
  Workflow, 
  WorkflowNode,
  useWorkflowsListStore, 
  useCurrentWorkflowStore,
  loadWorkflows,
  loadWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow
} from '@/stores/cachedWorkflowStore'
import useCacheManager from './use-cache-manager'

interface UseWorkflowsReturn {
  workflows: Workflow[] | null
  currentWorkflow: Workflow | null
  selectedNode: WorkflowNode | null
  loading: boolean
  error: string | null
  loadAllWorkflows: (forceRefresh?: boolean) => Promise<Workflow[]>
  loadWorkflowById: (id: string, forceRefresh?: boolean) => Promise<Workflow | null>
  createNewWorkflow: (name: string, description?: string) => Promise<Workflow>
  updateWorkflowById: (id: string, updates: Partial<Workflow>) => Promise<Workflow>
  deleteWorkflowById: (id: string) => Promise<void>
  setCurrentWorkflow: (workflow: Workflow | null) => void
  setSelectedNode: (node: WorkflowNode | null) => void
  addNode: (node: WorkflowNode) => void
  updateNode: (nodeId: string, updates: Partial<WorkflowNode>) => void
  removeNode: (nodeId: string) => void
  saveCurrentWorkflow: () => Promise<void>
}

export function useWorkflows(): UseWorkflowsReturn {
  // Initialize cache manager
  useCacheManager()
  
  // Access stores
  const { 
    data: workflows, 
    loading: workflowsLoading, 
    error: workflowsError 
  } = useWorkflowsListStore()
  
  const { 
    data: currentWorkflow, 
    loading: currentWorkflowLoading, 
    error: currentWorkflowError 
  } = useCurrentWorkflowStore()
  
  // Local state for selected node
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
  
  // Combined loading and error state
  const loading = workflowsLoading || currentWorkflowLoading
  const error = workflowsError || currentWorkflowError
  
  // Load all workflows (with cache)
  const loadAllWorkflows = useCallback(async (forceRefresh = false) => {
    return await loadWorkflows(forceRefresh)
  }, [])
  
  // Load a specific workflow (with cache)
  const loadWorkflowById = useCallback(async (id: string, forceRefresh = false) => {
    return await loadWorkflow(id, forceRefresh)
  }, [])
  
  // Create a new workflow
  const createNewWorkflow = useCallback(async (name: string, description?: string) => {
    return await createWorkflow(name, description)
  }, [])
  
  // Update a workflow
  const updateWorkflowById = useCallback(async (id: string, updates: Partial<Workflow>) => {
    return await updateWorkflow(id, updates)
  }, [])
  
  // Delete a workflow
  const deleteWorkflowById = useCallback(async (id: string) => {
    await deleteWorkflow(id)
  }, [])
  
  // Set the current workflow
  const setCurrentWorkflow = useCallback((workflow: Workflow | null) => {
    if (workflow) {
      useCurrentWorkflowStore.getState().setData(workflow)
    } else {
      useCurrentWorkflowStore.getState().clearData()
    }
    
    // Clear selected node when changing workflows
    setSelectedNode(null)
  }, [])
  
  // Add a node to the current workflow
  const addNode = useCallback((node: WorkflowNode) => {
    if (!currentWorkflow) return
    
    const updatedWorkflow = {
      ...currentWorkflow,
      nodes: [...currentWorkflow.nodes, node]
    }
    
    useCurrentWorkflowStore.getState().setData(updatedWorkflow)
  }, [currentWorkflow])
  
  // Update a node in the current workflow
  const updateNode = useCallback((nodeId: string, updates: Partial<WorkflowNode>) => {
    if (!currentWorkflow) return
    
    const updatedNodes = currentWorkflow.nodes.map(node => 
      node.id === nodeId ? { ...node, ...updates } : node
    )
    
    const updatedWorkflow = {
      ...currentWorkflow,
      nodes: updatedNodes
    }
    
    useCurrentWorkflowStore.getState().setData(updatedWorkflow)
    
    // Update selected node if it's the one being updated
    if (selectedNode?.id === nodeId) {
      setSelectedNode({ ...selectedNode, ...updates })
    }
  }, [currentWorkflow, selectedNode])
  
  // Remove a node from the current workflow
  const removeNode = useCallback((nodeId: string) => {
    if (!currentWorkflow) return
    
    const updatedNodes = currentWorkflow.nodes.filter(node => node.id !== nodeId)
    
    const updatedWorkflow = {
      ...currentWorkflow,
      nodes: updatedNodes
    }
    
    useCurrentWorkflowStore.getState().setData(updatedWorkflow)
    
    // Clear selected node if it's the one being removed
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null)
    }
  }, [currentWorkflow, selectedNode])
  
  // Save the current workflow to the database
  const saveCurrentWorkflow = useCallback(async () => {
    if (!currentWorkflow?.id) return
    
    await updateWorkflow(currentWorkflow.id, currentWorkflow)
  }, [currentWorkflow])
  
  // Don't auto-load workflows on mount - let the page component control this
  // to ensure fresh data is always loaded when viewing the workflows page
  
  return {
    workflows,
    currentWorkflow,
    selectedNode,
    loading,
    error,
    loadAllWorkflows,
    loadWorkflowById,
    createNewWorkflow,
    updateWorkflowById,
    deleteWorkflowById,
    setCurrentWorkflow,
    setSelectedNode,
    addNode,
    updateNode,
    removeNode,
    saveCurrentWorkflow
  }
} 