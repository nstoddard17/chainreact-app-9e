import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WorkflowError {
  id: string
  workflowId: string
  nodeId: string
  nodeName: string
  errorMessage: string
  timestamp: string
  executionSessionId?: string
}

interface WorkflowErrorState {
  errors: WorkflowError[]
  currentWorkflowErrors: WorkflowError[]
  
  // Actions
  addError: (error: Omit<WorkflowError, 'id'>) => void
  clearErrorsForWorkflow: (workflowId: string) => void
  clearErrorsForNode: (nodeId: string) => void
  clearAllErrors: () => void
  getErrorsForWorkflow: (workflowId: string) => WorkflowError[]
  getErrorsForNode: (nodeId: string) => WorkflowError[]
  getLatestErrorForNode: (nodeId: string) => WorkflowError | undefined
  setCurrentWorkflow: (workflowId: string) => void
}

export const useWorkflowErrorStore = create<WorkflowErrorState>()(
  persist(
    (set, get) => ({
      errors: [],
      currentWorkflowErrors: [],

      addError: (errorData) => {
        const error: WorkflowError = {
          ...errorData,
          id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }

        set((state) => ({
          errors: [error, ...state.errors].slice(0, 100), // Keep last 100 errors
          currentWorkflowErrors: errorData.workflowId === get().getCurrentWorkflowId() 
            ? [error, ...state.currentWorkflowErrors]
            : state.currentWorkflowErrors
        }))
      },

      clearErrorsForWorkflow: (workflowId) => {
        set((state) => ({
          errors: state.errors.filter(error => error.workflowId !== workflowId),
          currentWorkflowErrors: state.currentWorkflowErrors.filter(error => error.workflowId !== workflowId)
        }))
      },

      clearErrorsForNode: (nodeId) => {
        set((state) => ({
          errors: state.errors.filter(error => error.nodeId !== nodeId),
          currentWorkflowErrors: state.currentWorkflowErrors.filter(error => error.nodeId !== nodeId)
        }))
      },

      clearAllErrors: () => {
        set({ errors: [], currentWorkflowErrors: [] })
      },

      getErrorsForWorkflow: (workflowId) => {
        return get().errors.filter(error => error.workflowId === workflowId)
      },

      getErrorsForNode: (nodeId) => {
        return get().errors.filter(error => error.nodeId === nodeId)
      },

      getLatestErrorForNode: (nodeId) => {
        const nodeErrors = get().getErrorsForNode(nodeId)
        return nodeErrors.length > 0 ? nodeErrors[0] : undefined
      },

      setCurrentWorkflow: (workflowId) => {
        const workflowErrors = get().getErrorsForWorkflow(workflowId)
        set({ currentWorkflowErrors: workflowErrors })
      },

      // Helper to get current workflow ID (this would be set by the workflow builder)
      getCurrentWorkflowId: () => {
        // Get the current workflow ID from state if available
        const state = get()
        if (state.currentWorkflowErrors.length > 0) {
          return state.currentWorkflowErrors[0].workflowId
        }
        return ''
      }
    }),
    {
      name: 'workflow-errors',
      partialize: (state) => ({ errors: state.errors })
    }
  )
)
