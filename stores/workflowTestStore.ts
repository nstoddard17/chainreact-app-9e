import { create } from 'zustand'
import { TestModeConfig, ActionTestMode } from '@/lib/services/testMode/types'

interface WorkflowTestResult {
  nodeId: string
  nodeType: string
  nodeTitle: string
  input: any
  output: any
  success: boolean
  error?: string
  executionOrder: number
}

interface InterceptedAction {
  nodeId: string
  nodeTitle: string
  nodeType: string
  action: string
  destination: string
  data: any
  timestamp: string
}

// Extended node execution data for real-time display
export interface NodeExecutionData {
  nodeId: string
  nodeType?: string
  nodeTitle?: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused'
  preview?: string  // Short description of what's happening/happened
  output?: any      // Full output data
  error?: string    // Error message if failed
  executionTime?: number  // Time in ms
  startedAt?: number
}

export type TestFlowStatus = 'idle' | 'listening' | 'running' | 'paused' | 'completed' | 'error' | 'cancelled'

interface WorkflowTestState {
  // Current test session data
  testResults: WorkflowTestResult[]
  executionPath: string[]
  triggerOutput: any
  testedNodeId: string | null
  testTimestamp: number | null

  // Test flow execution state
  testFlowStatus: TestFlowStatus
  listeningTimeRemaining: number | null
  currentExecutingNodeId: string | null
  completedNodeIds: string[]
  failedNodeIds: string[]
  interceptedActions: InterceptedAction[]
  testConfig: TestModeConfig | null
  testError: string | null

  // NEW: Per-node execution data for real-time display
  nodeExecutionData: Record<string, NodeExecutionData>

  // Actions
  setTestResults: (results: WorkflowTestResult[], executionPath: string[], triggerOutput: any, testedNodeId: string) => void
  clearTestResults: () => void
  getNodeTestResult: (nodeId: string) => WorkflowTestResult | null
  getNodeInputOutput: (nodeId: string) => { input: any; output: any } | null
  isNodeInExecutionPath: (nodeId: string) => boolean
  hasTestResults: () => boolean

  // Test flow actions
  startListening: (config: TestModeConfig) => void
  updateListeningTime: (timeRemaining: number) => void
  startExecution: (nodeId: string) => void
  setNodeCompleted: (nodeId: string, output?: any) => void
  setNodeFailed: (nodeId: string, error: string) => void
  addInterceptedAction: (action: InterceptedAction) => void
  finishTestFlow: (status: 'completed' | 'error' | 'cancelled', error?: string) => void
  cancelTestFlow: () => void
  resetTestFlow: () => void

  // NEW: Enhanced node execution actions
  setNodeRunning: (nodeId: string, nodeType?: string, nodeTitle?: string, preview?: string) => void
  setNodePaused: (nodeId: string, nodeType?: string, nodeTitle?: string, preview?: string) => void
  setNodeCompletedWithDetails: (nodeId: string, output: any, preview: string, executionTime: number, nodeType?: string, nodeTitle?: string) => void
  setNodeFailedWithDetails: (nodeId: string, error: string, executionTime: number, nodeType?: string, nodeTitle?: string) => void
  getNodeExecutionData: (nodeId: string) => NodeExecutionData | null
}

export const useWorkflowTestStore = create<WorkflowTestState>((set, get) => ({
  testResults: [],
  executionPath: [],
  triggerOutput: null,
  testedNodeId: null,
  testTimestamp: null,

  // Test flow execution state
  testFlowStatus: 'idle',
  listeningTimeRemaining: null,
  currentExecutingNodeId: null,
  completedNodeIds: [],
  failedNodeIds: [],
  interceptedActions: [],
  testConfig: null,
  testError: null,

  // NEW: Per-node execution data
  nodeExecutionData: {},

  setTestResults: (results, executionPath, triggerOutput, testedNodeId) => {
    set({
      testResults: results,
      executionPath,
      triggerOutput,
      testedNodeId,
      testTimestamp: Date.now()
    })
  },

  clearTestResults: () => {
    set({
      testResults: [],
      executionPath: [],
      triggerOutput: null,
      testedNodeId: null,
      testTimestamp: null
    })
  },

  getNodeTestResult: (nodeId: string) => {
    const { testResults } = get()
    return testResults.find(result => result.nodeId === nodeId) || null
  },

  getNodeInputOutput: (nodeId: string) => {
    const { testResults, executionPath, triggerOutput } = get()

    // Find the node in test results
    const nodeResult = testResults.find(result => result.nodeId === nodeId)
    if (!nodeResult) return null

    // For the first node in execution path, input comes from trigger
    const nodeIndexInPath = executionPath.indexOf(nodeId)
    if (nodeIndexInPath === 0) {
      return {
        input: triggerOutput,
        output: nodeResult.output
      }
    }

    // For other nodes, input comes from the previous node's context
    return {
      input: nodeResult.input,
      output: nodeResult.output
    }
  },

  isNodeInExecutionPath: (nodeId: string) => {
    const { executionPath } = get()
    return executionPath.includes(nodeId)
  },

  hasTestResults: () => {
    const { testResults } = get()
    return testResults.length > 0
  },

  // Test flow actions
  startListening: (config: TestModeConfig) => {
    set({
      testFlowStatus: 'listening',
      listeningTimeRemaining: (config.triggerTimeout || 60000) / 1000,
      testConfig: config,
      testError: null,
      completedNodeIds: [],
      failedNodeIds: [],
      interceptedActions: [],
      currentExecutingNodeId: null,
      nodeExecutionData: {}
    })
  },

  updateListeningTime: (timeRemaining: number) => {
    set({ listeningTimeRemaining: timeRemaining })
  },

  startExecution: (nodeId: string) => {
    set({
      testFlowStatus: 'running',
      currentExecutingNodeId: nodeId,
      listeningTimeRemaining: null,
      nodeExecutionData: {} // Clear previous execution data when starting new execution
    })
  },

  setNodeCompleted: (nodeId: string, output?: any) => {
    const { completedNodeIds, testResults, executionPath } = get()
    if (!completedNodeIds.includes(nodeId)) {
      set({
        completedNodeIds: [...completedNodeIds, nodeId],
        currentExecutingNodeId: null,
        executionPath: executionPath.includes(nodeId) ? executionPath : [...executionPath, nodeId]
      })
    }
  },

  setNodeFailed: (nodeId: string, error: string) => {
    const { failedNodeIds } = get()
    if (!failedNodeIds.includes(nodeId)) {
      set({
        failedNodeIds: [...failedNodeIds, nodeId],
        currentExecutingNodeId: null,
        testFlowStatus: 'error',
        testError: error
      })
    }
  },

  addInterceptedAction: (action: InterceptedAction) => {
    const { interceptedActions } = get()
    set({
      interceptedActions: [...interceptedActions, action]
    })
  },

  finishTestFlow: (status: 'completed' | 'error' | 'cancelled', error?: string) => {
    set({
      testFlowStatus: status,
      currentExecutingNodeId: null,
      listeningTimeRemaining: null,
      testError: error || null
    })
  },

  cancelTestFlow: () => {
    set({
      testFlowStatus: 'cancelled',
      currentExecutingNodeId: null,
      listeningTimeRemaining: null
    })
  },

  resetTestFlow: () => {
    set({
      testFlowStatus: 'idle',
      listeningTimeRemaining: null,
      currentExecutingNodeId: null,
      completedNodeIds: [],
      failedNodeIds: [],
      interceptedActions: [],
      testConfig: null,
      testError: null,
      nodeExecutionData: {}
    })
  },

  // NEW: Enhanced node execution actions
  setNodeRunning: (nodeId: string, nodeType?: string, nodeTitle?: string, preview?: string) => {
    const { nodeExecutionData } = get()
    set({
      testFlowStatus: 'running',
      currentExecutingNodeId: nodeId,
      listeningTimeRemaining: null,
      nodeExecutionData: {
        ...nodeExecutionData,
        [nodeId]: {
          nodeId,
          nodeType,
          nodeTitle,
          status: 'running',
          preview,
          startedAt: Date.now()
        }
      }
    })
  },

  setNodePaused: (nodeId: string, nodeType?: string, nodeTitle?: string, preview?: string) => {
    const { nodeExecutionData } = get()
    set({
      testFlowStatus: 'paused',
      currentExecutingNodeId: nodeId,
      nodeExecutionData: {
        ...nodeExecutionData,
        [nodeId]: {
          nodeId,
          nodeType: nodeType || nodeExecutionData[nodeId]?.nodeType,
          nodeTitle: nodeTitle || nodeExecutionData[nodeId]?.nodeTitle,
          status: 'paused',
          preview: preview || 'Waiting for human input...',
          startedAt: nodeExecutionData[nodeId]?.startedAt || Date.now()
        }
      }
    })
  },

  setNodeCompletedWithDetails: (nodeId: string, output: any, preview: string, executionTime: number, nodeType?: string, nodeTitle?: string) => {
    const { completedNodeIds, executionPath, nodeExecutionData } = get()
    if (!completedNodeIds.includes(nodeId)) {
      set({
        completedNodeIds: [...completedNodeIds, nodeId],
        currentExecutingNodeId: null,
        executionPath: executionPath.includes(nodeId) ? executionPath : [...executionPath, nodeId],
        nodeExecutionData: {
          ...nodeExecutionData,
          [nodeId]: {
            nodeId,
            nodeType: nodeType || nodeExecutionData[nodeId]?.nodeType,
            nodeTitle: nodeTitle || nodeExecutionData[nodeId]?.nodeTitle,
            status: 'completed',
            preview,
            output,
            executionTime,
            startedAt: nodeExecutionData[nodeId]?.startedAt
          }
        }
      })
    }
  },

  setNodeFailedWithDetails: (nodeId: string, error: string, executionTime: number, nodeType?: string, nodeTitle?: string) => {
    const { failedNodeIds, nodeExecutionData } = get()
    if (!failedNodeIds.includes(nodeId)) {
      set({
        failedNodeIds: [...failedNodeIds, nodeId],
        currentExecutingNodeId: null,
        testFlowStatus: 'error',
        testError: error,
        nodeExecutionData: {
          ...nodeExecutionData,
          [nodeId]: {
            nodeId,
            nodeType: nodeType || nodeExecutionData[nodeId]?.nodeType,
            nodeTitle: nodeTitle || nodeExecutionData[nodeId]?.nodeTitle,
            status: 'failed',
            error,
            executionTime,
            startedAt: nodeExecutionData[nodeId]?.startedAt
          }
        }
      })
    }
  },

  getNodeExecutionData: (nodeId: string) => {
    const { nodeExecutionData } = get()
    return nodeExecutionData[nodeId] || null
  }
})) 