"use client"

import { create } from "zustand"
import { supabase } from "@/lib/supabase-singleton"
import { trackBetaTesterActivity } from "@/lib/utils/beta-tester-tracking"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"

export interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    type: string
    config: Record<string, any>
    savedDynamicOptions?: Record<string, any[]>
    providerId?: string
    isTrigger?: boolean
    title?: string
    description?: string
    isAIAgentChild?: boolean
    parentAIAgentId?: string
    parentChainIndex?: number
    emptiedChains?: number[]
    validationState?: {
      missingRequired: string[]
      lastValidatedAt?: string
      lastUpdatedAt?: string
      isValid?: boolean
      message?: string
    }
  }
}

export interface WorkflowConnection {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

function ensureWorkflowConnections(
  nodes: WorkflowNode[] = [],
  rawConnections: WorkflowConnection[] = []
): { connections: WorkflowConnection[]; addedConnections: WorkflowConnection[] } {
  const validNodeIds = new Set(nodes.map((node) => node.id))
  const existingConnections = Array.isArray(rawConnections)
    ? rawConnections.filter((conn) => validNodeIds.has(conn.source) && validNodeIds.has(conn.target))
    : []

  if (nodes.length < 2) {
    return { connections: existingConnections, addedConnections: [] }
  }

  const triggers = nodes.filter((node) => node.data?.isTrigger)
  const nonTriggers = nodes.filter((node) => !node.data?.isTrigger)

  if (triggers.length === 0 || nonTriggers.length === 0) {
    return { connections: existingConnections, addedConnections: [] }
  }

  const hasOutgoingFromTrigger = triggers.every((trigger) =>
    existingConnections.some((conn) => conn.source === trigger.id)
  )

  if (existingConnections.length > 0 && hasOutgoingFromTrigger) {
    return { connections: existingConnections, addedConnections: [] }
  }

  const sortByPosition = (a: WorkflowNode, b: WorkflowNode) => {
    const ay = a.position?.y ?? 0
    const by = b.position?.y ?? 0
    if (ay !== by) return ay - by
    const ax = a.position?.x ?? 0
    const bx = b.position?.x ?? 0
    return ax - bx
  }

  const orderedTriggers = [...triggers].sort(sortByPosition)
  const orderedActions = [...nonTriggers].sort(sortByPosition)

  if (orderedActions.length === 0) {
    return { connections: existingConnections, addedConnections: [] }
  }

  const dedupeKey = (conn: WorkflowConnection) => `${conn.source}->${conn.target}`
  const seen = new Set(existingConnections.map(dedupeKey))
  const generated: WorkflowConnection[] = []
  const idSeed = `edge-auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  orderedTriggers.forEach((trigger, index) => {
    const preferredAction = orderedActions[index] || orderedActions[0]
    if (!preferredAction) return
    const candidate: WorkflowConnection = {
      id: `${idSeed}-t${index}`,
      source: trigger.id,
      target: preferredAction.id,
    }
    const key = dedupeKey(candidate)
    if (!seen.has(key)) {
      generated.push(candidate)
      seen.add(key)
    }
  })

  for (let i = 0; i < orderedActions.length - 1; i++) {
    const sourceNode = orderedActions[i]
    const targetNode = orderedActions[i + 1]
    const candidate: WorkflowConnection = {
      id: `${idSeed}-a${i}`,
      source: sourceNode.id,
      target: targetNode.id,
    }
    const key = dedupeKey(candidate)
    if (!seen.has(key)) {
      generated.push(candidate)
      seen.add(key)
    }
  }

  if (generated.length === 0) {
    return { connections: existingConnections, addedConnections: [] }
  }

  return {
    connections: [...existingConnections, ...generated],
    addedConnections: generated,
  }
}

export interface Workflow {
  id: string
  name: string
  description: string | null
  user_id: string
  organization_id?: string | null
  nodes: WorkflowNode[]
  connections: WorkflowConnection[]
  status: string
  created_at: string
  updated_at: string
  visibility?: string
  executions_count?: number
  created_by?: string
  source_template_id?: string | null
  validationState?: {
    invalidNodeIds: string[]
    lastValidatedAt?: string
    lastUpdatedAt?: string
    integrationPaused?: string
  }
}

interface WorkflowState {
  workflows: Workflow[]
  currentWorkflow: Workflow | null
  selectedNode: WorkflowNode | null
  loadingList: boolean
  loadingCreate: boolean
  loadingSave: boolean
  updatingWorkflowIds: string[]
  deletingWorkflowIds: string[]
  error: string | null
  lastFetchTime: number | null
  fetchPromise: Promise<void> | null
}

interface WorkflowActions {
  fetchWorkflows: (organizationId?: string) => Promise<void>
  fetchPersonalWorkflows: () => Promise<void>
  fetchOrganizationWorkflows: (organizationId: string) => Promise<void>
  createWorkflow: (name: string, description?: string, organizationId?: string) => Promise<Workflow>
  updateWorkflow: (id: string, updates: Partial<Workflow>) => Promise<void>
  deleteWorkflow: (id: string) => Promise<void>
  moveWorkflowToOrganization: (workflowId: string, organizationId: string) => Promise<void>
  setCurrentWorkflow: (workflow: Workflow | null) => void
  setSelectedNode: (node: WorkflowNode | null) => void
  addNode: (node: WorkflowNode) => void
  updateNode: (nodeId: string, updates: Partial<WorkflowNode>) => void
  removeNode: (nodeId: string) => void
  saveWorkflow: () => Promise<void>
  generateWorkflowWithAI: (prompt: string) => Promise<Workflow>
  createTemplateFromWorkflow: (
    workflowId: string,
    templateData: {
      name: string
      description: string
      category: string
      tags: string[]
      is_public: boolean
    },
  ) => Promise<void>
  isWorkflowComplete: (workflow: Workflow) => boolean
  updateWorkflowStatus: (id: string) => Promise<void>
  pauseWorkflowsForIntegration: (providerId: string) => Promise<void>
  resumeWorkflowsForIntegration: (providerId: string) => Promise<void>
  clearAllData: () => void
  recalculateWorkflowValidation: (workflow: Workflow) => Workflow
  addWorkflowToStore: (workflow: Workflow) => void
}

export const useWorkflowStore = create<WorkflowState & WorkflowActions>((set, get) => ({
  workflows: [],
  currentWorkflow: null,
  selectedNode: null,
  loadingList: false,
  loadingCreate: false,
  loadingSave: false,
  updatingWorkflowIds: [],
  deletingWorkflowIds: [],
  error: null,
  lastFetchTime: null,
  fetchPromise: null,

  fetchWorkflows: async (organizationId?: string) => {
    if (!supabase) {
      console.warn("Supabase not available")
      set({ workflows: [], loadingList: false })
      return
    }

    // Check if we have a recent fetch (within 30 seconds) and return cached data
    const state = get()
    const CACHE_DURATION = 30000 // 30 seconds
    if (state.lastFetchTime && Date.now() - state.lastFetchTime < CACHE_DURATION && state.workflows.length > 0) {
      console.log('[WorkflowStore] Using cached workflows')
      return
    }

    // If already fetching, return the existing promise to avoid duplicate requests
    if (state.fetchPromise && state.loadingList) {
      console.log('[WorkflowStore] Already fetching, returning existing promise')
      return state.fetchPromise
    }

    // Create the fetch promise
    const fetchPromise = (async () => {
      set({ loadingList: true, error: null })

    try {
      // Add a reasonable timeout for the request
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      // RLS will automatically filter to user's workflows
      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .order("updated_at", { ascending: false })
        .abortSignal(controller.signal)

      clearTimeout(timeoutId)

      if (error) {
        if (error.message?.includes('aborted')) {
          console.warn("Workflows fetch timeout - continuing without blocking")
          set({ workflows: [], loadingList: false, error: null })
          return
        }
        throw error
      }

      set({
        workflows: data || [],
        loadingList: false,
        lastFetchTime: Date.now(),
        fetchPromise: null
      })
    } catch (error: any) {
      console.error("Error fetching workflows:", error)
      // Prior behavior: set empty workflows but clear loading and suppress user-facing error
      set({
        workflows: [],
        loadingList: false,
        error: null,
        fetchPromise: null
      })
    }
    })()

    // Store the promise
    set({ fetchPromise })

    // Execute and wait for it
    await fetchPromise
  },

  fetchPersonalWorkflows: async () => {
    if (!supabase) {
      console.warn("Supabase not available")
      set({ workflows: [], loadingList: false })
      return
    }

    set({ loadingList: true, error: null })

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        set({ workflows: [], loadingList: false })
        return
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .abortSignal(controller.signal)

      clearTimeout(timeoutId)

      if (error) {
        if (error.message?.includes('aborted')) {
          console.warn("Personal workflows fetch timeout - continuing without blocking")
          set({ workflows: [], loadingList: false, error: null })
          return
        }
        throw error
      }

      set({ workflows: data || [], loadingList: false })
    } catch (error: any) {
      console.error("Error fetching personal workflows:", error)
      set({ workflows: [], loadingList: false, error: null })
    }
  },

  fetchOrganizationWorkflows: async (organizationId: string) => {
    if (!supabase) {
      console.warn("Supabase not available")
      set({ workflows: [], loadingList: false })
      return
    }

    set({ loadingList: true, error: null })

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .abortSignal(controller.signal)

      clearTimeout(timeoutId)

      if (error) {
        if (error.message?.includes('aborted')) {
          console.warn("Organization workflows fetch timeout - continuing without blocking")
          set({ workflows: [], loadingList: false, error: null })
          return
        }
        throw error
      }

      set({ workflows: data || [], loadingList: false })
    } catch (error: any) {
      console.error("Error fetching organization workflows:", error)
      set({ workflows: [], loadingList: false, error: null })
    }
  },

  createWorkflow: async (name: string, description?: string, organizationId?: string) => {
    if (!supabase) {
      throw new Error("Supabase not available")
    }

    set({ loadingCreate: true, error: null })

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("User not authenticated")

      const { data, error } = await supabase
        .from("workflows")
        .insert({
          name,
          description: description || null,
          user_id: user.id,
          organization_id: organizationId || null, // Add organization_id if provided
          nodes: [],
          connections: [],
          status: "draft",
        })
        .select()
        .single()

      if (error) throw error

      set((state) => ({
        workflows: [data, ...state.workflows],
      }))

      // Log workflow creation
      try {
        if (user) {
          await supabase.from("audit_logs").insert({
            user_id: user.id,
            action: "workflow_created",
            resource_type: "workflow",
            resource_id: data.id,
            details: {
              workflow_id: data.id,
              workflow_name: data.name,
              workflow_description: data.description
            },
            created_at: new Date().toISOString()
          })

          // Track beta tester activity
          await trackBetaTesterActivity({
            userId: user.id,
            activityType: 'workflow_created',
            activityData: {
              workflowId: data.id,
              workflowName: data.name
            }
          })
        }
      } catch (auditError) {
        console.warn("Failed to log workflow creation:", auditError)
      }

      return data
    } catch (error: any) {
      console.error("Error creating workflow:", error)
      throw error
    } finally {
      set({ loadingCreate: false })
    }
  },

  updateWorkflow: async (id: string, updates: Partial<Workflow>) => {
    set((state) => {
      const next = new Set(state.updatingWorkflowIds)
      next.add(id)
      return { updatingWorkflowIds: Array.from(next) }
    })

    try {
      // Get the current workflow to compare status changes
      const currentWorkflow = get().workflows.find(w => w.id === id)
      const oldStatus = currentWorkflow?.status
      const newStatus = updates.status

      console.log(`📤 [WorkflowStore] Sending update request for ${id}:`, {
        oldStatus,
        newStatus,
        updates
      })

      // Use API endpoint to handle RLS-protected updates
      const response = await fetch(`/api/workflows/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      })

      console.log(`📥 [WorkflowStore] API Response status:`, response.status)

      if (!response.ok) {
        const error = await response.json()
        console.error(`❌ [WorkflowStore] Update failed:`, error)
        throw new Error(error.error || 'Failed to update workflow')
      }

      const data = await response.json()
      console.log(`✅ [WorkflowStore] API returned updated workflow:`, {
        id: data.id,
        status: data.status,
        name: data.name
      })

      set((state) => ({
        workflows: state.workflows.map((w) => (w.id === id ? { ...w, ...data } : w)),
        currentWorkflow:
          state.currentWorkflow?.id === id ? { ...state.currentWorkflow, ...data } : state.currentWorkflow,
      }))

      // Log workflow update
      if (supabase) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const logDetails: any = {
              workflow_id: id,
              workflow_name: data.name,
              workflow_description: data.description,
              updated_fields: Object.keys(updates)
            }

            // Add status change details if status was updated
            if (oldStatus && newStatus && oldStatus !== newStatus) {
              logDetails.status_change = {
                old_status: oldStatus,
                new_status: newStatus
              }
            }

            await supabase.from("audit_logs").insert({
              user_id: user.id,
              action: oldStatus !== newStatus ? "workflow_status_changed" : "workflow_updated",
              resource_type: "workflow",
              resource_id: id,
              details: logDetails,
              created_at: new Date().toISOString()
            })
          }
        } catch (auditError) {
          console.warn("Failed to log workflow update:", auditError)
        }
      }

      return data
    } catch (error: any) {
      console.error("Error updating workflow:", error)
      throw error
    } finally {
      set((state) => {
        const next = new Set(state.updatingWorkflowIds)
        next.delete(id)
        return { updatingWorkflowIds: Array.from(next) }
      })
    }
  },

  deleteWorkflow: async (id: string) => {
    set((state) => {
      const next = new Set(state.deletingWorkflowIds)
      next.add(id)
      return { deletingWorkflowIds: Array.from(next) }
    })

    let workflowToDelete: Workflow | undefined

    try {
      const response = await fetch(`/api/workflows/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete workflow')
      }

      // Get workflow details before deletion for audit log
      workflowToDelete = get().workflows.find(w => w.id === id)
      
      set((state) => ({
        workflows: state.workflows.filter((w) => w.id !== id),
        currentWorkflow: state.currentWorkflow?.id === id ? null : state.currentWorkflow,
      }))

      // Log workflow deletion
      if (workflowToDelete && supabase) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            await supabase.from("audit_logs").insert({
              user_id: user.id,
              action: "workflow_deleted",
              resource_type: "workflow",
              resource_id: id,
              details: {
                workflow_id: id,
                workflow_name: workflowToDelete.name,
                workflow_description: workflowToDelete.description
              },
              created_at: new Date().toISOString()
            })

            // Track beta tester activity
          }
        } catch (auditError) {
          console.warn("Failed to log workflow deletion:", auditError)
        }
      }
    } catch (error: any) {
      console.error("Error deleting workflow:", error)
      throw error
    } finally {
      set((state) => {
        const next = new Set(state.deletingWorkflowIds)
        next.delete(id)
        return { deletingWorkflowIds: Array.from(next) }
      })

      if (workflowToDelete && supabase) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            await trackBetaTesterActivity({
              userId: user.id,
              activityType: 'workflow_deleted',
              activityData: {
                workflowId: id,
                workflowName: workflowToDelete.name
              }
            })
          }
        } catch (activityError) {
          console.warn("Failed to track beta tester activity for deletion:", activityError)
        }
      }
    }
  },

  moveWorkflowToOrganization: async (workflowId: string, organizationId: string) => {
    if (!supabase) {
      throw new Error("Supabase not available")
    }

    try {
      const { data, error } = await supabase
        .from("workflows")
        .update({ organization_id: organizationId })
        .eq("id", workflowId)
        .select()
        .single()

      if (error) throw error

      set((state) => ({
        workflows: state.workflows.map((w) => (w.id === workflowId ? { ...w, organization_id: organizationId } : w)),
        currentWorkflow:
          state.currentWorkflow?.id === workflowId ? { ...state.currentWorkflow, organization_id: organizationId } : state.currentWorkflow,
      }))

      // Log workflow move
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from("audit_logs").insert({
            user_id: user.id,
            action: "workflow_moved_to_organization",
            resource_type: "workflow",
            resource_id: workflowId,
            details: {
              workflow_id: workflowId,
              workflow_name: data.name,
              organization_id: organizationId,
            },
            created_at: new Date().toISOString()
          })
        }
      } catch (auditError) {
        console.warn("Failed to log workflow move:", auditError)
      }
    } catch (error: any) {
      console.error("Error moving workflow to organization:", error)
      throw error
    }
  },

  setCurrentWorkflow: (workflow: Workflow | null) => {
    console.log('🏪 [WorkflowStore] Setting current workflow:', {
      id: workflow?.id,
      name: workflow?.name,
      nameType: typeof workflow?.name,
      nameIsEmpty: !workflow?.name,
      nameIsNull: workflow?.name === null,
      nameIsUndefined: workflow?.name === undefined
    });
    set({ currentWorkflow: workflow })
  },

  setSelectedNode: (node: WorkflowNode | null) => {
    set({ selectedNode: node })
  },

  addNode: (node: WorkflowNode) => {
    set((state) => ({
      currentWorkflow: state.currentWorkflow
        ? {
            ...state.currentWorkflow,
            nodes: [...state.currentWorkflow.nodes, node],
          }
        : null,
    }))
  },

  updateNode: (nodeId: string, updates: Partial<WorkflowNode>) => {
    set((state) => ({
      currentWorkflow: state.currentWorkflow
        ? {
            ...state.currentWorkflow,
            nodes: state.currentWorkflow.nodes.map((node) => (node.id === nodeId
              ? {
                  ...node,
                  ...updates,
                  data: {
                    ...node.data,
                    ...(updates.data || {}),
                  },
                }
              : node
            )),
            validationState: updates.data?.validationState
              ? {
                  invalidNodeIds: Array.from(
                    new Set([
                      ...(state.currentWorkflow.validationState?.invalidNodeIds || []).filter(id => id !== nodeId),
                      ...(updates.data.validationState.isValid ? [] : [nodeId])
                    ])
                  ),
                  lastValidatedAt: updates.data.validationState.lastValidatedAt,
                  lastUpdatedAt: updates.data.validationState.lastUpdatedAt
                }
              : state.currentWorkflow.validationState,
          }
        : null,
    }))
  },

  removeNode: (nodeId: string) => {
    set((state) => ({
      currentWorkflow: state.currentWorkflow
        ? {
            ...state.currentWorkflow,
            nodes: state.currentWorkflow.nodes.filter((node) => node.id !== nodeId),
            connections: state.currentWorkflow.connections.filter(
              (conn) => conn.source !== nodeId && conn.target !== nodeId,
            ),
          }
        : null,
    }))
  },

  saveWorkflow: async () => {
    const { currentWorkflow } = get()
    if (!currentWorkflow || !supabase) return

    set({ loadingSave: true, error: null })

    try {
      // Determine the appropriate status based on workflow completeness
      const hasTrigger = currentWorkflow.nodes.some(node => node.data?.isTrigger)
      const hasActions = currentWorkflow.nodes.some(node => !node.data?.isTrigger)

      const timestamp = new Date().toISOString()
      const nodesForUpdate = JSON.parse(JSON.stringify(currentWorkflow.nodes || [])) as WorkflowNode[]
      const existingConnections = JSON.parse(JSON.stringify(currentWorkflow.connections || [])) as WorkflowConnection[]
      const { connections: ensuredConnections, addedConnections } = ensureWorkflowConnections(nodesForUpdate, existingConnections)

      if (addedConnections.length > 0) {
        console.warn('⚠️ Auto-connected workflow nodes to prevent isolated triggers', {
          workflowId: currentWorkflow.id,
          addedConnections: addedConnections.map(({ source, target }) => ({ source, target }))
        })
      }

      const isComplete = hasTrigger && hasActions && ensuredConnections.length > 0

      // Update status: 'active' if complete, 'draft' if incomplete
      const newStatus = isComplete ? 'active' : 'draft'

      // Validate the data structure before sending
      if (!Array.isArray(nodesForUpdate) || !Array.isArray(ensuredConnections)) {
        throw new Error("Invalid workflow data structure")
      }

      const updateData = {
        nodes: nodesForUpdate,
        connections: ensuredConnections,
        status: newStatus,
        updated_at: timestamp,
      }

      const { error } = await supabase
        .from("workflows")
        .update(updateData)
        .eq("id", currentWorkflow.id)

      if (error) {
        console.error("Error updating workflow:", error)
        console.error("Update data was:", updateData)
        throw error
      }

      const updatedWorkflowState: Workflow = {
        ...currentWorkflow,
        nodes: nodesForUpdate,
        connections: ensuredConnections,
        status: newStatus,
        updated_at: timestamp
      }

      // Update the workflow in the list
      set((state) => ({
        workflows: state.workflows.map((w) =>
          w.id === currentWorkflow.id
            ? { ...w, ...updatedWorkflowState }
            : w,
        ),
        currentWorkflow: updatedWorkflowState
      }))

      // Log workflow status change
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from("audit_logs").insert({
            user_id: user.id,
            action: "workflow_status_changed",
            resource_type: "workflow",
            resource_id: currentWorkflow.id,
            details: {
              workflow_id: currentWorkflow.id,
              workflow_name: currentWorkflow.name,
              old_status: currentWorkflow.status,
              new_status: newStatus,
              reason: isComplete ? "workflow_completed" : "workflow_incomplete"
            },
            created_at: new Date().toISOString()
          })
        }
      } catch (auditError) {
        console.warn("Failed to log workflow status change:", auditError)
      }
    } catch (error: any) {
      console.error("Error saving workflow:", error)
      throw error
    } finally {
      set({ loadingSave: false })
    }
  },

  generateWorkflowWithAI: async (prompt: string) => {
    try {
      const response = await fetch("/api/ai/generate-workflow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Failed to generate workflow")
      }

      // Add the new workflow to the list
      set((state) => ({
        workflows: [data.workflow, ...state.workflows],
      }))

      return data.workflow
    } catch (error: any) {
      console.error("Error generating workflow with AI:", error)
      throw error
    }
  },

  createTemplateFromWorkflow: async (workflowId: string, templateData) => {
    if (!supabase) {
      throw new Error("Supabase not available")
    }

    try {
      const workflow = get().workflows.find((w) => w.id === workflowId)
      if (!workflow) throw new Error("Workflow not found")

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("User not authenticated")

      const { error } = await supabase.from("templates").insert({
        ...templateData,
        workflow_json: {
          nodes: workflow.nodes,
          connections: workflow.connections,
        },
        created_by: user.id,
      })

      if (error) throw error
    } catch (error: any) {
      console.error("Error creating template:", error)
      throw error
    }
  },

  // Helper function to check if a workflow is complete
  isWorkflowComplete: (workflow: Workflow): boolean => {
    const hasTrigger = workflow.nodes.some(node => node.data?.isTrigger)
    const hasActions = workflow.nodes.some(node => !node.data?.isTrigger)
    const hasConnections = workflow.connections.length > 0
    return hasTrigger && hasActions && hasConnections
  },

  // Function to update workflow status based on completeness
  updateWorkflowStatus: async (id: string) => {
    const { workflows, updateWorkflow } = get()
    const workflow = workflows.find(w => w.id === id)
    
    if (!workflow) return

    const isComplete = get().isWorkflowComplete(workflow)
    const newStatus = isComplete ? 'active' : 'draft'
    
    if (workflow.status !== newStatus) {
      await updateWorkflow(id, { status: newStatus })
    }
  },

  pauseWorkflowsForIntegration: async (providerId: string) => {
    const { workflows, updateWorkflow } = get()
    const affectedWorkflows = workflows.filter(workflow =>
      workflow.nodes.some(node => {
        const nodeProvider =
          node.data?.providerId ||
          node.data?.config?.providerId ||
          ALL_NODE_COMPONENTS.find(component => component.type === node.data?.type)?.providerId
        return nodeProvider === providerId
      })
    )

    if (!affectedWorkflows.length) return

    for (const workflow of affectedWorkflows) {
      if (workflow.status !== 'paused') {
        const validationState = {
          ...(workflow.validationState || {}),
          integrationPaused: providerId,
          lastValidatedAt: new Date().toISOString(),
        }

        await updateWorkflow(workflow.id, {
          status: 'paused',
          validationState: validationState as any,
        })
      }
    }
  },

  resumeWorkflowsForIntegration: async (providerId: string) => {
    const { workflows, updateWorkflow } = get()
    const affectedWorkflows = workflows.filter(workflow =>
      workflow.status === 'paused' && workflow.validationState?.integrationPaused === providerId
    )

    if (!affectedWorkflows.length) return

    for (const workflow of affectedWorkflows) {
      const validationState = {
        ...(workflow.validationState || {}),
        lastValidatedAt: new Date().toISOString(),
      }
      delete (validationState as any).integrationPaused

      await updateWorkflow(workflow.id, {
        status: 'draft',
        validationState: validationState as any,
      })
    }
  },

  clearAllData: () => {
    set({
      workflows: [],
      currentWorkflow: null,
      selectedNode: null,
      loadingList: false,
      loadingCreate: false,
      loadingSave: false,
      updatingWorkflowIds: [],
      deletingWorkflowIds: [],
      error: null,
    })
  },

  recalculateWorkflowValidation: (workflow: Workflow): Workflow => {
    // Import validation utilities
    const { validateWorkflowNodes } = require('@/lib/workflows/validation/workflow')
    const { ALL_NODE_COMPONENTS } = require('@/lib/workflows/nodes')

    // Validate nodes and get the result
    const validationResult = validateWorkflowNodes(workflow, ALL_NODE_COMPONENTS)

    // Update workflow with validated nodes and validation state
    return {
      ...workflow,
      nodes: validationResult.nodes,
      validationState: {
        invalidNodeIds: validationResult.invalidNodeIds,
        lastValidatedAt: new Date().toISOString(),
        lastUpdatedAt: workflow.updated_at,
      },
    }
  },

  addWorkflowToStore: (workflow: Workflow) => {
    console.log('[WorkflowStore] Adding workflow to store:', workflow.id)
    set((state) => ({
      workflows: [workflow, ...state.workflows],
    }))
  },
}))
