/**
 * Hook to handle workspace selection before workflow creation
 * Respects user's workflow_creation_mode preference:
 * - "default": Use saved default workspace
 * - "ask": Show workspace selector modal
 * - "follow_switcher": Use current workspace switcher selection
 */

import { useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext'

interface WorkspaceSelection {
  type: 'personal' | 'team' | 'organization'
  id: string | null
  name: string
  folder_id?: string | null
}

export function useWorkflowCreation() {
  const { profile } = useAuthStore()
  const { setWorkspaceContext } = useWorkflowStore()
  const { workspaceContext } = useWorkspaceContext()
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false)
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  /**
   * Initiates workflow creation with workspace selection
   * @param onProceed - Callback to execute after workspace is selected
   */
  const initiateWorkflowCreation = useCallback((onProceed: () => void) => {
    const mode = profile?.workflow_creation_mode || 'ask'

    switch (mode) {
      case 'default':
        // Use saved default workspace
        if (profile?.default_workspace_type) {
          setWorkspaceContext(
            profile.default_workspace_type,
            profile.default_workspace_id || null
          )
        }
        // Proceed immediately
        onProceed()
        break

      case 'follow_switcher':
        // Use current workspace switcher selection (already set in workspaceContext)
        // Ensure workspace context is set
        if (workspaceContext) {
          setWorkspaceContext(workspaceContext.type, workspaceContext.id)
        }
        // Proceed immediately
        onProceed()
        break

      case 'ask':
      default:
        // Show workspace selector modal
        setPendingCallback(() => onProceed)
        setShowWorkspaceModal(true)
        break
    }
  }, [profile, workspaceContext, setWorkspaceContext])

  /**
   * Handle workspace selection from modal
   */
  const handleWorkspaceSelected = useCallback((selection: WorkspaceSelection, saveAsDefault: boolean) => {
    // Set workspace context
    setWorkspaceContext(selection.type, selection.id)

    // Store folder_id for workflow creation
    setSelectedFolderId(selection.folder_id || null)

    // Optionally save as default
    if (saveAsDefault && profile) {
      // This will be handled by the modal component calling updateProfile
    }

    // Close modal
    setShowWorkspaceModal(false)

    // Execute pending callback
    if (pendingCallback) {
      pendingCallback()
      setPendingCallback(null)
    }
  }, [setWorkspaceContext, pendingCallback, profile])

  /**
   * Cancel workspace selection
   */
  const handleCancelWorkspaceSelection = useCallback(() => {
    setShowWorkspaceModal(false)
    setPendingCallback(null)
  }, [])

  return {
    initiateWorkflowCreation,
    showWorkspaceModal,
    handleWorkspaceSelected,
    handleCancelWorkspaceSelection,
    selectedFolderId, // Expose folder_id for workflow creation
  }
}
