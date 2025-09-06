import { create } from 'zustand'

export type NodeExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'waiting'

interface StepExecutionState {
  // Execution state
  isStepMode: boolean
  isPaused: boolean
  currentNodeId: string | null
  nodeStatuses: Record<string, NodeExecutionStatus>
  nodeResults: Record<string, { input?: any; output?: any; error?: string; timestamp: number }>
  executionPath: string[]
  
  // Control actions
  startStepExecution: () => void
  stopStepExecution: () => void
  pauseExecution: () => void
  continueExecution: () => void
  
  // Node status updates
  setNodeStatus: (nodeId: string, status: NodeExecutionStatus) => void
  setNodeResult: (nodeId: string, result: { input?: any; output?: any; error?: string }) => void
  setCurrentNode: (nodeId: string | null) => void
  addToExecutionPath: (nodeId: string) => void
  
  // Reset
  resetExecution: () => void
}

export const useWorkflowStepExecutionStore = create<StepExecutionState>((set) => ({
  // Initial state
  isStepMode: false,
  isPaused: false,
  currentNodeId: null,
  nodeStatuses: {},
  nodeResults: {},
  executionPath: [],
  
  // Control actions
  startStepExecution: () => set({ 
    isStepMode: true, 
    isPaused: true, // Start paused so user can see what will happen
    nodeStatuses: {}, 
    nodeResults: {},
    executionPath: [],
    currentNodeId: null 
  }),
  
  stopStepExecution: () => set({ 
    isStepMode: false, 
    isPaused: false,
    currentNodeId: null,
    nodeStatuses: {},  // Clear all node statuses
    nodeResults: {},   // Clear all results
    executionPath: []  // Clear execution path
  }),
  
  pauseExecution: () => set({ isPaused: true }),
  
  continueExecution: () => set({ isPaused: false }),
  
  // Node status updates
  setNodeStatus: (nodeId, status) => set((state) => ({
    nodeStatuses: { ...state.nodeStatuses, [nodeId]: status }
  })),
  
  setNodeResult: (nodeId, result) => set((state) => ({
    nodeResults: { 
      ...state.nodeResults, 
      [nodeId]: { ...result, timestamp: Date.now() }
    }
  })),
  
  setCurrentNode: (nodeId) => set({ currentNodeId: nodeId }),
  
  addToExecutionPath: (nodeId) => set((state) => ({
    executionPath: [...state.executionPath, nodeId]
  })),
  
  // Reset
  resetExecution: () => set({
    isStepMode: false,
    isPaused: false,
    currentNodeId: null,
    nodeStatuses: {},
    nodeResults: {},
    executionPath: []
  })
}))