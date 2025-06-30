import { create } from 'zustand'

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

interface WorkflowTestState {
  // Current test session data
  testResults: WorkflowTestResult[]
  executionPath: string[]
  triggerOutput: any
  testedNodeId: string | null
  testTimestamp: number | null
  
  // Actions
  setTestResults: (results: WorkflowTestResult[], executionPath: string[], triggerOutput: any, testedNodeId: string) => void
  clearTestResults: () => void
  getNodeTestResult: (nodeId: string) => WorkflowTestResult | null
  getNodeInputOutput: (nodeId: string) => { input: any; output: any } | null
  isNodeInExecutionPath: (nodeId: string) => boolean
  hasTestResults: () => boolean
}

export const useWorkflowTestStore = create<WorkflowTestState>((set, get) => ({
  testResults: [],
  executionPath: [],
  triggerOutput: null,
  testedNodeId: null,
  testTimestamp: null,

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
  }
})) 