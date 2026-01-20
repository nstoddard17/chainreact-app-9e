"use client"

import { create } from "zustand"

interface WorkflowCostState {
  workflowId: string | null
  estimatedTasks: number
  byProvider: Map<string, { tasks: number; count: number }>
}

interface WorkflowCostActions {
  setWorkflowCost: (
    id: string,
    tasks: number,
    byProvider?: Map<string, { tasks: number; count: number }>
  ) => void
  clearWorkflowCost: () => void
}

export const useWorkflowCostStore = create<WorkflowCostState & WorkflowCostActions>((set) => ({
  workflowId: null,
  estimatedTasks: 0,
  byProvider: new Map(),

  setWorkflowCost: (id, tasks, byProvider) => {
    set({
      workflowId: id,
      estimatedTasks: tasks,
      byProvider: byProvider || new Map()
    })
  },

  clearWorkflowCost: () => {
    set({
      workflowId: null,
      estimatedTasks: 0,
      byProvider: new Map()
    })
  }
}))
