"use client"

import { create } from "zustand"
import { supabase } from "@/lib/supabase-singleton"

export interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    type: string
    config: Record<string, any>
    providerId?: string
    isTrigger?: boolean
    title?: string
    description?: string
  }
}

export interface WorkflowConnection {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
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
}

interface WorkflowState {
  workflows: Workflow[]
  currentWorkflow: Workflow | null
  selectedNode: WorkflowNode | null
  loading: boolean
  error: string | null
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
  clearAllData: () => void
}

export const useWorkflowStore = create<WorkflowState & WorkflowActions>((set, get) => ({
  workflows: [],
  currentWorkflow: null,
  selectedNode: null,
  loading: false,
  error: null,

  fetchWorkflows: async (organizationId?: string) => {
    if (!supabase) {
      console.warn("Supabase not available")
      return
    }

    set({ loading: true, error: null })
    try {
      // RLS will automatically filter to user's workflows
      const { data, error } = await supabase.from("workflows").select("*").order("updated_at", { ascending: false })

      if (error) throw error

      set({ workflows: data || [], loading: false })
    } catch (error: any) {
      console.error("Error fetching workflows:", error)
      set({ error: error.message, loading: false })
    }
  },

  fetchPersonalWorkflows: async () => {
    if (!supabase) {
      console.warn("Supabase not available")
      return
    }

    set({ loading: true, error: null })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        set({ workflows: [], loading: false })
        return
      }

      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })

      if (error) throw error

      set({ workflows: data || [], loading: false })
    } catch (error: any) {
      console.error("Error fetching personal workflows:", error)
      set({ error: error.message, loading: false })
    }
  },

  fetchOrganizationWorkflows: async (organizationId: string) => {
    if (!supabase) {
      console.warn("Supabase not available")
      return
    }

    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })

      if (error) throw error

      set({ workflows: data || [], loading: false })
    } catch (error: any) {
      console.error("Error fetching organization workflows:", error)
      set({ error: error.message, loading: false })
    }
  },

  createWorkflow: async (name: string, description?: string, organizationId?: string) => {
    if (!supabase) {
      throw new Error("Supabase not available")
    }

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
        }
      } catch (auditError) {
        console.warn("Failed to log workflow creation:", auditError)
      }

      return data
    } catch (error: any) {
      console.error("Error creating workflow:", error)
      throw error
    }
  },

  updateWorkflow: async (id: string, updates: Partial<Workflow>) => {
    if (!supabase) {
      throw new Error("Supabase not available")
    }

    try {
      // Get the current workflow to compare status changes
      const currentWorkflow = get().workflows.find(w => w.id === id)
      const oldStatus = currentWorkflow?.status
      const newStatus = updates.status

      const { data, error } = await supabase.from("workflows").update(updates).eq("id", id).select().single()

      if (error) throw error

      set((state) => ({
        workflows: state.workflows.map((w) => (w.id === id ? { ...w, ...data } : w)),
        currentWorkflow:
          state.currentWorkflow?.id === id ? { ...state.currentWorkflow, ...data } : state.currentWorkflow,
      }))

      // Log workflow update
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
    } catch (error: any) {
      console.error("Error updating workflow:", error)
      throw error
    }
  },

  deleteWorkflow: async (id: string) => {
    if (!supabase) {
      throw new Error("Supabase not available")
    }

    try {
      const { error } = await supabase.from("workflows").delete().eq("id", id)

      if (error) throw error

      // Get workflow details before deletion for audit log
      const workflowToDelete = get().workflows.find(w => w.id === id)
      
      set((state) => ({
        workflows: state.workflows.filter((w) => w.id !== id),
        currentWorkflow: state.currentWorkflow?.id === id ? null : state.currentWorkflow,
      }))

      // Log workflow deletion
      if (workflowToDelete) {
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
          }
        } catch (auditError) {
          console.warn("Failed to log workflow deletion:", auditError)
        }
      }
    } catch (error: any) {
      console.error("Error deleting workflow:", error)
      throw error
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
            nodes: state.currentWorkflow.nodes.map((node) => (node.id === nodeId ? { ...node, ...updates } : node)),
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

    try {
      // Determine the appropriate status based on workflow completeness
      const hasTrigger = currentWorkflow.nodes.some(node => node.data?.isTrigger)
      const hasActions = currentWorkflow.nodes.some(node => !node.data?.isTrigger)
      const isComplete = hasTrigger && hasActions && currentWorkflow.connections.length > 0
      
      // Update status: 'active' if complete, 'draft' if incomplete
      const newStatus = isComplete ? 'active' : 'draft'
      
      const { error } = await supabase
        .from("workflows")
        .update({
          nodes: currentWorkflow.nodes,
          connections: currentWorkflow.connections,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentWorkflow.id)

      if (error) throw error

      // Update the workflow in the list
      set((state) => ({
        workflows: state.workflows.map((w) =>
          w.id === currentWorkflow.id
            ? { 
                ...w, 
                nodes: currentWorkflow.nodes, 
                connections: currentWorkflow.connections,
                status: newStatus,
                updated_at: new Date().toISOString()
              }
            : w,
        ),
        currentWorkflow: {
          ...currentWorkflow,
          status: newStatus,
          updated_at: new Date().toISOString()
        }
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

  clearAllData: () => {
    set({
      workflows: [],
      currentWorkflow: null,
      selectedNode: null,
      loading: false,
      error: null,
    })
  },
}))
