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
  nodes: WorkflowNode[]
  connections: WorkflowConnection[]
  status: string
  created_at: string
  updated_at: string
}

interface WorkflowState {
  workflows: Workflow[]
  currentWorkflow: Workflow | null
  selectedNode: WorkflowNode | null
  loading: boolean
  error: string | null
}

interface WorkflowActions {
  fetchWorkflows: () => Promise<void>
  createWorkflow: (name: string, description?: string) => Promise<Workflow>
  updateWorkflow: (id: string, updates: Partial<Workflow>) => Promise<void>
  deleteWorkflow: (id: string) => Promise<void>
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
}

export const useWorkflowStore = create<WorkflowState & WorkflowActions>((set, get) => ({
  workflows: [],
  currentWorkflow: null,
  selectedNode: null,
  loading: false,
  error: null,

  fetchWorkflows: async () => {
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

  createWorkflow: async (name: string, description?: string) => {
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
      const { data, error } = await supabase.from("workflows").update(updates).eq("id", id).select().single()

      if (error) throw error

      set((state) => ({
        workflows: state.workflows.map((w) => (w.id === id ? { ...w, ...data } : w)),
        currentWorkflow:
          state.currentWorkflow?.id === id ? { ...state.currentWorkflow, ...data } : state.currentWorkflow,
      }))
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

      set((state) => ({
        workflows: state.workflows.filter((w) => w.id !== id),
        currentWorkflow: state.currentWorkflow?.id === id ? null : state.currentWorkflow,
      }))
    } catch (error: any) {
      console.error("Error deleting workflow:", error)
      throw error
    }
  },

  setCurrentWorkflow: (workflow: Workflow | null) => {
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
      const { error } = await supabase
        .from("workflows")
        .update({
          nodes: currentWorkflow.nodes,
          connections: currentWorkflow.connections,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentWorkflow.id)

      if (error) throw error

      // Update the workflow in the list
      set((state) => ({
        workflows: state.workflows.map((w) =>
          w.id === currentWorkflow.id
            ? { ...w, nodes: currentWorkflow.nodes, connections: currentWorkflow.connections }
            : w,
        ),
      }))
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
}))
