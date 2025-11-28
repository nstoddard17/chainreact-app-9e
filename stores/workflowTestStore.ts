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

export type TestFlowStatus = 'idle' | 'listening' | 'running' | 'completed' | 'error' | 'cancelled'

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
      currentExecutingNodeId: null
    })
  },

  updateListeningTime: (timeRemaining: number) => {
    set({ listeningTimeRemaining: timeRemaining })
  },

  startExecution: (nodeId: string) => {
    set({
      testFlowStatus: 'running',
      currentExecutingNodeId: nodeId,
      listeningTimeRemaining: null
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
      testError: null
    })
  }
})) 