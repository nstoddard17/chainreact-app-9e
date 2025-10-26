/**
 * useWorkflowSaveActions
 *
 * Handles workflow save, update, and status toggle operations.
 * Uses stable callback references to prevent unnecessary re-renders.
 *
 * Key improvements over original implementation:
 * - Stable callbacks using refs for latest values (prevents infinite loops)
 * - Separates action logic from state management
 * - Prevents cascading re-renders
 * - Uses ref-based "useEvent" pattern for stable references
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'
import { logger } from '@/lib/utils/logger'
import type { Workflow, WorkflowNode, WorkflowConnection } from '@/stores/workflowStore'
import type { Node, Edge } from '@xyflow/react'

interface SaveTemplateDraftOptions {
  nodes?: WorkflowNode[]
  connections?: WorkflowConnection[]
  primarySetupTarget?: string | null
  setupOverview?: any | null
  integrationSetup?: any[]
  defaultFieldValues?: Record<string, any>
  status?: string
}

interface UseWorkflowSaveActionsProps {
  currentWorkflow: Workflow | null
  setCurrentWorkflow: (workflow: Workflow) => void
  updateWorkflow: (id: string, updates: Partial<Workflow>) => Promise<void>
  workflowName: string
  workflowDescription: string
  nodes: Node[]
  edges: Edge[]
  getNodes: () => Node[]
  getEdges: () => Edge[]
  isTemplateEditing: boolean
  editTemplateId: string | null
  saveTemplateDraft: (options: SaveTemplateDraftOptions) => Promise<any>
  setHasUnsavedChanges: (value: boolean) => void
  hasUnsavedChanges: boolean
}

export function useWorkflowSaveActions({
  currentWorkflow,
  setCurrentWorkflow,
  updateWorkflow,
  workflowName,
  workflowDescription,
  nodes,
  edges,
  getNodes,
  getEdges,
  isTemplateEditing,
  editTemplateId,
  saveTemplateDraft,
  setHasUnsavedChanges,
  hasUnsavedChanges,
}: UseWorkflowSaveActionsProps) {
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  // Refs to track save state and prevent cascading saves
  const justSavedRef = useRef(false)

  // Refs for latest values to avoid stale closures
  // This implements the "useEvent" pattern for stable callbacks
  const propsRef = useRef({
    currentWorkflow,
    workflowName,
    workflowDescription,
    nodes,
    edges,
    isTemplateEditing,
    editTemplateId,
    hasUnsavedChanges,
  })

  // Update refs on every render to ensure fresh values
  useEffect(() => {
    propsRef.current = {
      currentWorkflow,
      workflowName,
      workflowDescription,
      nodes,
      edges,
      isTemplateEditing,
      editTemplateId,
      hasUnsavedChanges,
    }
  })

  /**
   * Serialize workflow state - filters out UI-only nodes
   */
  const serializeWorkflowState = useCallback(() => {
    const currentNodes = getNodes()
    const currentEdges = getEdges()

    // Filter out AddAction and placeholder nodes
    const placeholderNodeIds = new Set(
      currentNodes
        .filter(n =>
          n.type === 'addAction' ||
          n.type === 'chainPlaceholder' ||
          n.type === 'insertAction' ||
          (typeof n.id === 'string' && (
            n.id.startsWith('add-action-') ||
            n.id.startsWith('chain-placeholder-') ||
            n.id.startsWith('insert-action-')
          ))
        )
        .map(n => n.id)
    )

    const persistedNodes = currentNodes.filter(n => !placeholderNodeIds.has(n.id))
    const persistedEdges = currentEdges.filter(e =>
      !placeholderNodeIds.has(e.source) &&
      !placeholderNodeIds.has(e.target) &&
      !e.target.includes('add-action') &&
      !e.source.includes('add-action') &&
      !e.target.includes('insert-action') &&
      !e.source.includes('insert-action')
    )

    const workflowNodes: WorkflowNode[] = persistedNodes.map(node => ({
      id: node.id,
      type: node.type || 'custom',
      position: node.position,
      data: node.data,
    }))

    const workflowConnections: WorkflowConnection[] = persistedEdges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    }))

    return { workflowNodes, workflowConnections, persistedNodes, persistedEdges }
  }, [getNodes, getEdges])

  /**
   * Handle save - stable callback using refs for latest values
   * This prevents recreation on every render while still accessing current state
   *
   * IMPORTANT: The callback itself is stable (doesn't change on re-renders)
   * But it reads the latest values from propsRef.current
   */
  const handleSave = useCallback(async () => {
    const { workflowNodes, workflowConnections } = serializeWorkflowState()

    // Use refs for latest values (avoids stale closures)
    const {
      isTemplateEditing: isTemplate,
      editTemplateId: templateId,
      currentWorkflow: workflow,
      workflowName: name,
      workflowDescription: description,
    } = propsRef.current

    // Template editing path
    if (isTemplate) {
      if (!templateId) {
        toast({
          title: "Error",
          description: "Missing template identifier",
          variant: "destructive",
        })
        return
      }

      try {
        setIsSaving(true)

        // Update template metadata
        const metaResponse = await fetch(`/api/templates/${templateId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            description,
          }),
        })

        const metaBody = await metaResponse.json().catch(() => ({}))
        if (!metaResponse.ok) {
          throw new Error(metaBody.error || 'Failed to update template details')
        }

        // Save template draft
        const savedDraft = await saveTemplateDraft({
          nodes: workflowNodes,
          connections: workflowConnections,
        })

        // Update local state
        if (workflow) {
          setCurrentWorkflow({
            ...workflow,
            name,
            description,
            nodes: workflowNodes,
            connections: workflowConnections,
            status: (savedDraft?.status as Workflow['status']) || workflow.status,
            updated_at: new Date().toISOString(),
          })
        }

        toast({
          title: "Template draft saved",
          description: "Your template draft has been updated.",
        })
      } catch (error: any) {
        logger.error('Error updating template draft:', error)
        setHasUnsavedChanges(true)
        toast({
          title: "Error",
          description: error?.message || "Failed to save template draft",
          variant: "destructive",
        })
      } finally {
        setIsSaving(false)
      }

      return
    }

    // Regular workflow save path
    if (!workflow?.id) {
      toast({
        title: "Error",
        description: "No workflow to save",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSaving(true)

      await updateWorkflow(workflow.id, {
        name,
        description,
        nodes: workflowNodes,
        connections: workflowConnections,
      })

      justSavedRef.current = true
      setHasUnsavedChanges(false)

      setTimeout(() => {
        justSavedRef.current = false
      }, 500)

      // If workflow is also a template, update template too
      if (templateId) {
        try {
          const response = await fetch(`/api/templates/${templateId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              nodes: workflowNodes,
              connections: workflowConnections,
            }),
          })

          const errorBody = !response.ok ? await response.json().catch(() => ({})) : null
          if (!response.ok) {
            throw new Error(errorBody?.error || 'Failed to update template')
          }

          toast({
            title: "Success",
            description: "Workflow and template saved successfully",
          })
        } catch (templateError) {
          logger.error('Error updating template:', templateError)
          toast({
            title: "Warning",
            description: "Workflow saved, but failed to update template",
            variant: "destructive",
          })
        }
      } else {
        toast({
          title: "Success",
          description: "Workflow saved successfully",
        })
      }
    } catch (error) {
      logger.error('Error saving workflow:', error)
      toast({
        title: "Error",
        description: "Failed to save workflow",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }, [serializeWorkflowState, saveTemplateDraft, toast])

  /**
   * Handle toggle live status - stable callback using refs
   */
  const handleToggleLive = useCallback(async () => {
    const {
      isTemplateEditing: isTemplate,
      currentWorkflow: workflow,
      hasUnsavedChanges: unsaved,
      nodes: currentNodes,
    } = propsRef.current

    if (isTemplate) {
      toast({
        title: "Unavailable",
        description: "Templates cannot be activated",
        variant: "destructive",
      })
      return
    }

    if (!workflow?.id) {
      toast({
        title: "Error",
        description: "No workflow to activate",
        variant: "destructive",
      })
      return
    }

    if (unsaved) {
      toast({
        title: "Save Required",
        description: "Please save your changes before activating the workflow",
        variant: "destructive",
      })
      return
    }

    // Check for validation errors when activating
    if (workflow.status !== 'active') {
      const nodesWithErrors = currentNodes.filter(node => {
        const validationState = node.data?.validationState
        if (!validationState || validationState.isValid) return false

        const missingFields = validationState.missingRequired || []
        const allRequiredFields = validationState.allRequiredFields || []

        return missingFields.length > 0 || allRequiredFields.length > 0
      })

      if (nodesWithErrors.length > 0) {
        const nodeNames = nodesWithErrors
          .map(n => n.data?.title || n.data?.type || 'Unknown')
          .join(', ')

        toast({
          title: "Missing Required Fields",
          description: `Cannot activate workflow. The following nodes have missing required fields: ${nodeNames}. Please configure all required fields before activating.`,
          variant: "destructive",
        })
        return
      }
    }

    try {
      setIsUpdatingStatus(true)

      const isActivating = workflow.status !== 'active'
      const endpoint = isActivating ? 'activate' : 'deactivate'

      logger.debug(`${isActivating ? 'Activating' : 'Deactivating'} workflow:`, {
        workflowId: workflow.id,
        currentStatus: workflow.status
      })

      const response = await fetch(`/api/workflows/${workflow.id}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to ${endpoint} workflow`)
      }

      const data = await response.json()
      logger.debug(`${endpoint} result:`, data)

      // Update local state
      setCurrentWorkflow({
        ...workflow,
        ...data
      })

      const successMessage = isActivating
        ? 'Workflow is now live and listening for triggers'
        : 'Workflow deactivated. All triggers and webhooks have been cleaned up.'

      toast({
        title: "Success",
        description: successMessage,
        variant: isActivating ? 'default' : 'secondary',
      })
    } catch (error: any) {
      logger.error(`Error ${workflow.status === 'active' ? 'deactivating' : 'activating'} workflow:`, error)
      toast({
        title: "Error",
        description: error?.message || `Failed to ${workflow.status === 'active' ? 'deactivate' : 'activate'} workflow`,
        variant: "destructive",
      })
    } finally {
      setIsUpdatingStatus(false)
    }
  }, [toast])

  return {
    isSaving,
    isUpdatingStatus,
    handleSave,
    handleToggleLive,
    justSavedRef,
    serializeWorkflowState,
  }
}
