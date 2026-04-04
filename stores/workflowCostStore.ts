"use client"

import { create } from "zustand"

export interface LoopCostDetailClient {
  loopNodeId: string
  innerCost: number
  maxIterations: number
  expandedCost: number
}

interface WorkflowCostState {
  workflowId: string | null
  estimatedTasks: number
  worstCaseTasks: number
  hasLoops: boolean
  loopDetails: LoopCostDetailClient[]
  byNode: Record<string, number>
  byProvider: Record<string, { tasks: number; count: number }>
}

interface WorkflowCostActions {
  /** Backward-compatible setter (flat cost only) */
  setWorkflowCost: (
    id: string,
    tasks: number,
    byProvider?: Map<string, { tasks: number; count: number }>
  ) => void

  /** Full setter with loop-aware fields */
  setWorkflowCostDetailed: (
    id: string,
    data: {
      estimatedTasks: number
      worstCaseTasks: number
      hasLoops: boolean
      loopDetails: LoopCostDetailClient[]
      byNode: Record<string, number>
      byProvider: Record<string, { tasks: number; count: number }>
    }
  ) => void

  clearWorkflowCost: () => void
}

const initialState: WorkflowCostState = {
  workflowId: null,
  estimatedTasks: 0,
  worstCaseTasks: 0,
  hasLoops: false,
  loopDetails: [],
  byNode: {},
  byProvider: {},
}

export const useWorkflowCostStore = create<WorkflowCostState & WorkflowCostActions>((set) => ({
  ...initialState,

  setWorkflowCost: (id, tasks, byProvider) => {
    // Convert Map to plain object for backward compat callers
    const providerObj: Record<string, { tasks: number; count: number }> = {}
    if (byProvider) {
      byProvider.forEach((v, k) => { providerObj[k] = v })
    }
    set({
      workflowId: id,
      estimatedTasks: tasks,
      worstCaseTasks: tasks, // no loop info — worst case = flat
      hasLoops: false,
      loopDetails: [],
      byNode: {},
      byProvider: providerObj,
    })
  },

  setWorkflowCostDetailed: (id, data) => {
    set({
      workflowId: id,
      estimatedTasks: data.estimatedTasks,
      worstCaseTasks: data.worstCaseTasks,
      hasLoops: data.hasLoops,
      loopDetails: data.loopDetails,
      byNode: data.byNode,
      byProvider: data.byProvider,
    })
  },

  clearWorkflowCost: () => {
    set(initialState)
  },
}))
