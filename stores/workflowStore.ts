"use client"

import { create } from "zustand"
import { supabase } from "@/utils/supabaseClient"
import { trackBetaTesterActivity } from "@/lib/utils/beta-tester-tracking"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import { logger } from "@/lib/utils/logger"
import { WorkflowService } from "@/services/workflow-service"
import { SessionManager } from "@/lib/auth/session"

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
  folder_id?: string | null
  nodes: WorkflowNode[]
  connections: WorkflowConnection[]
  status: 'draft' | 'active' | 'inactive'
  created_at: string
  updated_at: string
  visibility?: string
  executions_count?: number
  created_by?: string
  source_template_id?: string | null
  deleted_at?: string | null
  original_folder_id?: string | null
  workspace_type?: 'personal' | 'team' | 'organization'
  workspace_id?: string | null
  user_permission?: 'use' | 'manage' | 'admin'
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
  // Workspace context
  workspaceType: 'personal' | 'team' | 'organization'
  workspaceId: string | null
  currentUserId: string | null
}

interface WorkflowActions {
  fetchWorkflows: (force?: boolean, workspaceType?: 'personal' | 'team' | 'organization', workspaceId?: string) => Promise<void>
  fetchPersonalWorkflows: () => Promise<void>
  fetchOrganizationWorkflows: (organizationId: string) => Promise<void>
  createWorkflow: (name: string, description?: string, organizationId?: string, folderId?: string) => Promise<Workflow>
  updateWorkflow: (id: string, updates: Partial<Workflow>) => Promise<void>
  deleteWorkflow: (id: string) => Promise<void>
  moveWorkflowToTrash: (id: string) => Promise<void>
  restoreWorkflowFromTrash: (id: string) => Promise<void>
  emptyTrash: () => Promise<void>
  moveWorkflowToOrganization: (workflowId: string, organizationId: string) => Promise<void>
  invalidateCache: () => void
  setCurrentWorkflow: (workflow: Workflow | null) => void
  setSelectedNode: (node: WorkflowNode | null) => void
  setWorkspaceContext: (workspaceType: 'personal' | 'team' | 'organization', workspaceId?: string | null) => void
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
  // Workspace context - default to personal
  workspaceType: 'personal',
  workspaceId: null,
  currentUserId: null,

  fetchWorkflows: async (force = false, workspaceType?: 'personal' | 'team' | 'organization', workspaceId?: string) => {
    const state = get()

    // If already fetching, return the existing promise to avoid duplicate requests
    if (state.fetchPromise && state.loadingList) {
      logger.debug('[WorkflowStore] Already fetching, waiting for existing request')
      return state.fetchPromise
    }

    // Use provided workspace context or fallback to store state
    const effectiveWorkspaceType = workspaceType || get().workspaceType
    const effectiveWorkspaceId = workspaceId || get().workspaceId || undefined

    // Reduced cache duration to 5 seconds - workflows change frequently
    const CACHE_DURATION = 5000 // 5 seconds
    const timeSinceLastFetch = state.lastFetchTime ? Date.now() - state.lastFetchTime : Infinity

    if (!force && timeSinceLastFetch < CACHE_DURATION && state.workflows.length > 0) {
      logger.debug('[WorkflowStore] Using cached workflows (age: ' + Math.round(timeSinceLastFetch / 1000) + 's)')
      return
    }

    // Create the fetch promise
    const fetchPromise = (async () => {
      logger.debug('[WorkflowStore] Starting fresh workflow fetch')
      set({ loadingList: true, error: null, lastFetchTime: Date.now() })

      try {
        // Try to get user session, but handle auth failures gracefully
        let user;
        try {
          const sessionData = await SessionManager.getSecureUserAndSession();
          user = sessionData.user;
        } catch (authError: any) {
          logger.debug("User not authenticated, skipping workflow fetch")
          set({
            workflows: [],
            loadingList: false,
            currentUserId: null,
            error: null,
            fetchPromise: null
          })
          return
        }

        // If currentUserId is not set, set it now
        if (!state.currentUserId) {
          set({ currentUserId: user.id })
        } else if (user?.id !== state.currentUserId) {
          logger.warn("User session mismatch detected")
          set({
            workflows: [],
            currentUserId: user.id,
            error: null,
          })
        }

        const workflows = await WorkflowService.fetchWorkflows(force, effectiveWorkspaceType, effectiveWorkspaceId)

        logger.debug('[WorkflowStore] Successfully fetched workflows', {
          count: workflows.length,
          workspaceType: effectiveWorkspaceType,
          workspaceId: effectiveWorkspaceId
        });

        set({
          workflows,
          loadingList: false,
          lastFetchTime: Date.now(),
          fetchPromise: null
        })

      } catch (error: any) {
        logger.error("Error fetching workflows:", error)
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
      logger.warn("Supabase not available")
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
          logger.warn("Personal workflows fetch timeout - continuing without blocking")
          set({ workflows: [], loadingList: false, error: null })
          return
        }
        throw error
      }

      set({ workflows: data || [], loadingList: false })
    } catch (error: any) {
      logger.error("Error fetching personal workflows:", error)
      set({ workflows: [], loadingList: false, error: null })
    }
  },

  fetchOrganizationWorkflows: async (organizationId: string) => {
    // TEMP: organization_id column doesn't exist yet (pending workspace migration)
    // For now, just fetch all user workflows
    logger.warn("fetchOrganizationWorkflows called but organization_id column doesn't exist yet - falling back to regular fetch")
    await get().fetchWorkflows()
  },

  createWorkflow: async (name: string, description?: string, organizationId?: string, folderId?: string) => {
    set({ loadingCreate: true, error: null })

    try {
      const state = get()
      const effectiveWorkspaceType = state.workspaceType
      const effectiveWorkspaceId = state.workspaceId

      const workflow = await WorkflowService.createWorkflow(
        name,
        description,
        effectiveWorkspaceType,
        effectiveWorkspaceId || undefined,
        organizationId,
        folderId
      )

      // Add to local store
      set((state) => ({
        workflows: [workflow, ...state.workflows],
      }))

      // Track beta tester activity
      try {
        const { user } = await SessionManager.getSecureUserAndSession()
        if (user) {
          await trackBetaTesterActivity({
            userId: user.id,
            activityType: 'workflow_created',
            activityData: {
              workflowId: workflow.id,
              workflowName: workflow.name
            }
          })
        }
      } catch (trackError) {
        logger.warn("Failed to track workflow creation:", trackError)
      }

      return workflow
    } catch (error: any) {
      logger.error("Error creating workflow:", error)
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

      logger.debug(`📤 [WorkflowStore] Sending update request for ${id}:`, {
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

      logger.debug(`📥 [WorkflowStore] API Response status:`, response.status)

      if (!response.ok) {
        const error = await response.json()
        logger.error(`❌ [WorkflowStore] Update failed:`, error)
        throw new Error(error.error || 'Failed to update workflow')
      }

      const data = await response.json()
      logger.debug(`✅ [WorkflowStore] API returned updated workflow:`, {
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
          logger.warn("Failed to log workflow update:", auditError)
        }
      }

      return data
    } catch (error: any) {
      logger.error("Error updating workflow:", error)
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
    // Get workflow details before deletion for rollback and logging
    const workflowToDelete = get().workflows.find(w => w.id === id)

    if (!workflowToDelete) {
      throw new Error('Workflow not found')
    }

    // OPTIMISTIC UPDATE: Remove from UI immediately
    set((state) => ({
      workflows: state.workflows.filter((w) => w.id !== id),
      currentWorkflow: state.currentWorkflow?.id === id ? null : state.currentWorkflow,
      deletingWorkflowIds: [...state.deletingWorkflowIds, id]
    }))

    // Handle backend deletion asynchronously (non-blocking)
    // This allows multiple deletions to happen in parallel
    const deleteAsync = async () => {
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

        // Log workflow deletion in background
        if (supabase) {
          try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              // Audit log
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
              await trackBetaTesterActivity({
                userId: user.id,
                activityType: 'workflow_deleted',
                activityData: {
                  workflowId: id,
                  workflowName: workflowToDelete.name
                }
              })
            }
          } catch (auditError: any) {
            const errorMessage = auditError?.message || auditError?.toString() || 'Unknown error'
            logger.warn("Failed to log workflow deletion:", errorMessage)
          }
        }

        logger.info("Workflow deleted successfully:", id)
      } catch (error: any) {
        // Properly extract error message for logging
        const errorMessage = error?.message || error?.toString() || 'Unknown error'
        logger.error("Error deleting workflow from backend:", errorMessage, {
          workflowId: id,
          workflowName: workflowToDelete.name,
          error: error?.stack || error
        })

        // Don't rollback - keep the workflow deleted from UI
        // The backend deletion failed but we don't want to restore it to the UI
        // This provides better UX - the workflow stays deleted visually

        // Note: Not throwing error to prevent rollback
        // throw error
      } finally {
        // Remove from deleting state
        set((state) => ({
          deletingWorkflowIds: state.deletingWorkflowIds.filter(wId => wId !== id)
        }))
      }
    }

    // Execute deletion asynchronously - don't await (non-blocking)
    // This allows multiple deletions in parallel
    deleteAsync().catch((error) => {
      // This catch block shouldn't be reached anymore since we're not throwing errors
      // But keeping it just in case for unexpected errors
      const errorMessage = error?.message || error?.toString() || 'Unknown error'
      logger.error("Unexpected error in async workflow deletion:", errorMessage, {
        workflowId: id,
        error: error?.stack || error
      })
    })

    // Return immediately (optimistic update already applied)
  },

  moveWorkflowToTrash: async (id: string) => {
    const workflowToTrash = get().workflows.find(w => w.id === id)

    if (!workflowToTrash) {
      throw new Error('Workflow not found')
    }

    try {
      // Call the database function to move workflow to trash
      const { error } = await supabase.rpc('move_workflow_to_trash', {
        workflow_id: id
      })

      if (error) {
        throw error
      }

      // Clear cache and refresh workflows to show updated state
      set({ lastFetchTime: null, fetchPromise: null })
      await get().fetchWorkflows()

      logger.info("Workflow moved to trash:", id)
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error'
      logger.error("Error moving workflow to trash:", errorMessage, {
        workflowId: id,
        error: error?.stack || error
      })
      throw error
    }
  },

  restoreWorkflowFromTrash: async (id: string) => {
    try {
      // Call the database function to restore workflow from trash
      const { error } = await supabase.rpc('restore_workflow_from_trash', {
        workflow_id: id
      })

      if (error) {
        throw error
      }

      // Clear cache and refresh workflows to show updated state
      set({ lastFetchTime: null, fetchPromise: null })
      await get().fetchWorkflows()

      logger.info("Workflow restored from trash:", id)
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error'
      logger.error("Error restoring workflow from trash:", errorMessage, {
        workflowId: id,
        error: error?.stack || error
      })
      throw error
    }
  },

  emptyTrash: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('User not authenticated')
      }

      // Call the database function to empty user's trash
      const { error } = await supabase.rpc('empty_user_trash', {
        user_uuid: user.id
      })

      if (error) {
        throw error
      }

      // Clear cache and refresh workflows to show updated state
      set({ lastFetchTime: null, fetchPromise: null })
      await get().fetchWorkflows()

      logger.info("User trash emptied successfully")
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error'
      logger.error("Error emptying trash:", errorMessage, {
        error: error?.stack || error
      })
      throw error
    }
  },

  moveWorkflowToOrganization: async (workflowId: string, organizationId: string) => {
    // TEMP: organization_id column doesn't exist yet (pending workspace migration)
    // This function is disabled until the migration is complete
    logger.warn("moveWorkflowToOrganization called but organization_id column doesn't exist yet - operation skipped")
    throw new Error("Organization features are not yet available. The workspace migration is pending.")
  },

  invalidateCache: () => {
    logger.debug('🏪 [WorkflowStore] Invalidating cache')
    set({ lastFetchTime: null })
  },

  setCurrentWorkflow: (workflow: Workflow | null) => {
    logger.debug('🏪 [WorkflowStore] Setting current workflow:', {
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

  setWorkspaceContext: (workspaceType: 'personal' | 'team' | 'organization', workspaceId?: string | null) => {
    logger.debug('[WorkflowStore] Setting workspace context:', {
      workspaceType,
      workspaceId
    });
    set({
      workspaceType,
      workspaceId: workspaceId || null,
      // Invalidate cache when workspace context changes
      lastFetchTime: null
    })
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
        logger.warn('⚠️ Auto-connected workflow nodes to prevent isolated triggers', {
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
        logger.error("Error updating workflow:", error)
        logger.error("Update data was:", updateData)
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
        logger.warn("Failed to log workflow status change:", auditError)
      }
    } catch (error: any) {
      logger.error("Error saving workflow:", error)
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
      logger.error("Error generating workflow with AI:", error)
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
      logger.error("Error creating template:", error)
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
      if (workflow.status !== 'inactive') {
        const validationState = {
          ...(workflow.validationState || {}),
          integrationPaused: providerId,
          lastValidatedAt: new Date().toISOString(),
        }

        await updateWorkflow(workflow.id, {
          status: 'inactive',
          validationState: validationState as any,
        })
      }
    }
  },

  resumeWorkflowsForIntegration: async (providerId: string) => {
    const { workflows, updateWorkflow } = get()
    const affectedWorkflows = workflows.filter(workflow =>
      workflow.status === 'inactive' && workflow.validationState?.integrationPaused === providerId
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
    logger.debug('[WorkflowStore] Adding workflow to store:', workflow.id)
    set((state) => ({
      workflows: [workflow, ...state.workflows.filter(existing => existing.id !== workflow.id)],
    }))
  },
}))
