import { useEffect, useState, useCallback } from 'react'
import {
  Workflow,
  WorkflowNode,
  useWorkflowStore
} from '../stores/workflowStore'

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
  const {
    workflows,
    currentWorkflow,
    loading: storeLoading,
    error: storeError,
    fetchWorkflows,
    createWorkflow: storeCreateWorkflow,
    updateWorkflow: storeUpdateWorkflow,
    deleteWorkflow: storeDeleteWorkflow,
    setCurrentWorkflow: storeSetCurrentWorkflow,
    addNode: storeAddNode,
    updateNode: storeUpdateNode,
    removeNode: storeRemoveNode,
    saveWorkflow
  } = useWorkflowStore()
  
  // Local state for selected node and loading
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Load all workflows
  const loadAllWorkflows = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setError(null)
    try {
      await fetchWorkflows()
      return workflows || []
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows')
      return []
    } finally {
      setLoading(false)
    }
  }, [fetchWorkflows, workflows])
  
  // Load a specific workflow
  const loadWorkflowById = useCallback(async (id: string, forceRefresh = false) => {
    setLoading(true)
    setError(null)
    try {
      // First try to find in existing workflows
      const existing = workflows.find(w => w.id === id)
      if (existing && !forceRefresh) {
        storeSetCurrentWorkflow(existing)
        return existing
      }

      // Otherwise fetch all workflows and find it
      await fetchWorkflows()
      const workflow = workflows.find(w => w.id === id) || null
      if (workflow) {
        storeSetCurrentWorkflow(workflow)
      }
      return workflow
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow')
      return null
    } finally {
      setLoading(false)
    }
  }, [workflows, fetchWorkflows, storeSetCurrentWorkflow])
  
  // Create a new workflow
  const createNewWorkflow = useCallback(async (name: string, description?: string) => {
    setLoading(true)
    setError(null)
    try {
      const workflow = await storeCreateWorkflow(name, description)
      return workflow
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workflow')
      throw err
    } finally {
      setLoading(false)
    }
  }, [storeCreateWorkflow])
  
  // Update a workflow
  const updateWorkflowById = useCallback(async (id: string, updates: Partial<Workflow>) => {
    // Don't set global loading for individual workflow updates - let the UI handle it locally
    setError(null)
    try {
      await storeUpdateWorkflow(id, updates)
      // Return the updated workflow
      const updated = workflows.find(w => w.id === id)
      return updated || currentWorkflow as Workflow
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update workflow')
      throw err
    }
  }, [storeUpdateWorkflow, workflows, currentWorkflow])
  
  // Delete a workflow
  const deleteWorkflowById = useCallback(async (id: string) => {
    // Don't set global loading for individual workflow operations - let the UI handle it locally
    setError(null)
    try {
      await storeDeleteWorkflow(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workflow')
      throw err
    }
  }, [storeDeleteWorkflow])
  
  // Set the current workflow
  const setCurrentWorkflow = useCallback((workflow: Workflow | null) => {
    storeSetCurrentWorkflow(workflow)
    // Clear selected node when changing workflows
    setSelectedNode(null)
  }, [storeSetCurrentWorkflow])
  
  // Add a node to the current workflow
  const addNode = useCallback((node: WorkflowNode) => {
    if (!currentWorkflow) return
    storeAddNode(node)
  }, [currentWorkflow, storeAddNode])
  
  // Update a node in the current workflow
  const updateNode = useCallback((nodeId: string, updates: Partial<WorkflowNode>) => {
    if (!currentWorkflow) return
    storeUpdateNode(nodeId, updates)

    // Update selected node if it's the one being updated
    if (selectedNode?.id === nodeId) {
      setSelectedNode({ ...selectedNode, ...updates })
    }
  }, [currentWorkflow, selectedNode, storeUpdateNode])
  
  // Remove a node from the current workflow
  const removeNode = useCallback((nodeId: string) => {
    if (!currentWorkflow) return
    storeRemoveNode(nodeId)

    // Clear selected node if it's the one being removed
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null)
    }
  }, [currentWorkflow, selectedNode, storeRemoveNode])
  
  // Save the current workflow to the database
  const saveCurrentWorkflow = useCallback(async () => {
    if (!currentWorkflow?.id) return

    setLoading(true)
    setError(null)
    try {
      await saveWorkflow()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workflow')
      throw err
    } finally {
      setLoading(false)
    }
  }, [currentWorkflow, saveWorkflow])
  
  // Combine loading states
  const isLoading = loading || storeLoading
  const errorMessage = error || storeError

  return {
    workflows: workflows || null,
    currentWorkflow,
    selectedNode,
    loading: isLoading,
    error: errorMessage,
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