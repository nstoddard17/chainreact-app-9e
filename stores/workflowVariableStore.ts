"use client"

import { create } from "zustand"
import { createClient } from "@/utils/supabaseClient"

interface WorkflowVariable {
  id: string
  workflow_id: string
  name: string
  value: any
  type: "string" | "number" | "boolean" | "object" | "array"
  created_at: string
  updated_at: string
}

interface WorkflowVariableState {
  variables: WorkflowVariable[]
  loading: boolean
  error: string | null
}

interface WorkflowVariableActions {
  fetchVariables: (workflowId: string) => Promise<void>
  setVariable: (workflowId: string, name: string, value: any, type?: string) => Promise<void>
  getVariable: (workflowId: string, name: string) => any
  deleteVariable: (id: string) => Promise<void>
  clearVariables: () => void
}

export const useWorkflowVariableStore = create<WorkflowVariableState & WorkflowVariableActions>((set, get) => ({
  variables: [],
  loading: false,
  error: null,

  fetchVariables: async (workflowId: string) => {
    const supabase = createClient()

    set({ loading: true, error: null })

    try {
      const { data, error } = await supabase
        .from("workflow_variables")
        .select("*")
        .eq("workflow_id", workflowId)
        .order("created_at", { ascending: false })

      if (error) throw error

      set({ variables: data || [], loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  setVariable: async (workflowId: string, name: string, value: any, type = "string") => {
    const supabase = createClient()

    try {
      const { data, error } = await supabase
        .from("workflow_variables")
        .upsert({
          workflow_id: workflowId,
          name,
          value,
          type,
        })
        .select()
        .single()

      if (error) throw error

      set((state) => ({
        variables: [...state.variables.filter((v) => !(v.workflow_id === workflowId && v.name === name)), data],
      }))
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  getVariable: (workflowId: string, name: string) => {
    const { variables } = get()
    const variable = variables.find((v) => v.workflow_id === workflowId && v.name === name)
    return variable?.value
  },

  deleteVariable: async (id: string) => {
    const supabase = createClient()

    try {
      const { error } = await supabase.from("workflow_variables").delete().eq("id", id)

      if (error) throw error

      set((state) => ({
        variables: state.variables.filter((v) => v.id !== id),
      }))
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  clearVariables: () => {
    set({ variables: [] })
  },
}))
