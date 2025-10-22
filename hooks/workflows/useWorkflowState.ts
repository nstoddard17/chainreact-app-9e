/**
 * useWorkflowState
 *
 * Centralized Zustand store selectors with shallow equality to prevent unnecessary re-renders.
 * This hook provides stable references to store state and actions.
 */

import { useWorkflowStore, type Workflow } from '@/stores/workflowStore'
import { useCollaborationStore } from '@/stores/collaborationStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useWorkflowErrorStore } from '@/stores/workflowErrorStore'

export function useWorkflowState() {
  // Workflow store - using individual selectors for stability
  // Note: We avoid shallow() due to Next.js SSR issues with getServerSnapshot
  const workflows = useWorkflowStore(state => state.workflows)
  const currentWorkflow = useWorkflowStore(state => state.currentWorkflow)
  const setCurrentWorkflow = useWorkflowStore(state => state.setCurrentWorkflow)
  const updateWorkflow = useWorkflowStore(state => state.updateWorkflow)
  const removeNode = useWorkflowStore(state => state.removeNode)
  const workflowLoading = useWorkflowStore(state => state.loading)
  const fetchWorkflows = useWorkflowStore(state => state.fetchWorkflows)
  const addWorkflowToStore = useWorkflowStore(state => state.addWorkflowToStore)

  // Collaboration store
  const joinCollaboration = useCollaborationStore(state => state.joinCollaboration)
  const leaveCollaboration = useCollaborationStore(state => state.leaveCollaboration)
  const collaborators = useCollaborationStore(state => state.collaborators)

  // Integration store
  const getConnectedProviders = useIntegrationStore(state => state.getConnectedProviders)
  const integrationsLoading = useIntegrationStore(state => state.loading)

  // Error store
  const addError = useWorkflowErrorStore(state => state.addError)
  const setErrorStoreWorkflow = useWorkflowErrorStore(state => state.setCurrentWorkflow)
  const getLatestErrorForNode = useWorkflowErrorStore(state => state.getLatestErrorForNode)

  return {
    // Workflow state
    workflows,
    currentWorkflow,
    setCurrentWorkflow,
    updateWorkflow,
    removeNode,
    workflowLoading,
    fetchWorkflows,
    addWorkflowToStore,

    // Collaboration state
    joinCollaboration,
    leaveCollaboration,
    collaborators,

    // Integration state
    getConnectedProviders,
    integrationsLoading,

    // Error state
    addError,
    setErrorStoreWorkflow,
    getLatestErrorForNode,
  }
}
