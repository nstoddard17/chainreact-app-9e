"use client"

import { create } from "zustand"

interface Workflow {
  id: string
  name: string
  description: string
  nodes: any[]
  connections: any[]
  status: string
  created_at: string
  updated_at: string
}

interface WorkflowState {
  workflows: Workflow[]
  currentWorkflow: Workflow | null
  selectedNode: any | null
  loading: boolean
  error: string | null
}

interface WorkflowActions {
  fetchWorkflows: () => Promise<void>
  createWorkflow: (data: Partial<Workflow>) => Promise<void>
  updateWorkflow: (id: string, data: Partial<Workflow>) => Promise<void>
  deleteWorkflow: (id: string) => Promise<void>
  setCurrentWorkflow: (workflow: Workflow | null) => void
  setSelectedNode: (node: any | null) => void
  addNode: (node: any) => void
  saveWorkflow: () => Promise<void>
}

export const useWorkflowStore = create<WorkflowState & WorkflowActions>((set, get) => ({
  workflows: [],
  currentWorkflow: null,
  selectedNode: null,
  loading: false,
  error: null,

  fetchWorkflows: async () => {
    set({ loading: true, error: null })
    try {
      // Mock workflows
      const mockWorkflows: Workflow[] = [
        {
          id: "1",
          name: "Sample Workflow",
          description: "A sample workflow for testing",
          nodes: [],
          connections: [],
          status: "draft",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]
      set({ workflows: mockWorkflows, loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  createWorkflow: async (data: Partial<Workflow>) => {
    set({ loading: true, error: null })
    try {
      const newWorkflow: Workflow = {
        id: Date.now().toString(),
        name: data.name || "New Workflow",
        description: data.description || "",
        nodes: [],
        connections: [],
        status: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      set((state) => ({
        workflows: [...state.workflows, newWorkflow],
        loading: false,
      }))
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  updateWorkflow: async (id: string, data: Partial<Workflow>) => {
    try {
      set((state) => ({
        workflows: state.workflows.map((w) =>
          w.id === id ? { ...w, ...data, updated_at: new Date().toISOString() } : w,
        ),
      }))
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  deleteWorkflow: async (id: string) => {
    try {
      set((state) => ({
        workflows: state.workflows.filter((w) => w.id !== id),
      }))
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  setCurrentWorkflow: (workflow: Workflow | null) => {
    set({ currentWorkflow: workflow })
  },

  setSelectedNode: (node: any | null) => {
    set({ selectedNode: node })
  },

  addNode: (node: any) => {
    set((state) => ({
      currentWorkflow: state.currentWorkflow
        ? {
            ...state.currentWorkflow,
            nodes: [...(state.currentWorkflow.nodes || []), node],
          }
        : null,
    }))
  },

  saveWorkflow: async () => {
    const { currentWorkflow } = get()
    if (!currentWorkflow) return

    try {
      // Mock save
      set((state) => ({
        workflows: state.workflows.map((w) =>
          w.id === currentWorkflow.id ? { ...currentWorkflow, updated_at: new Date().toISOString() } : w,
        ),
      }))
    } catch (error: any) {
      set({ error: error.message })
    }
  },
}))
