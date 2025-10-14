import { useState, useCallback } from 'react'

import { logger } from '@/lib/utils/logger'
import type { NodeComponent } from '@/lib/workflows/nodes'

interface IntegrationInfo {
  id: string
  name: string
  description: string
  category: string
  color: string
  triggers: NodeComponent[]
  actions: NodeComponent[]
}

export function useWorkflowDialogs() {
  const [showTriggerDialog, setShowTriggerDialog] = useState(false)
  const [showActionDialog, setShowActionDialog] = useState(false)
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false)
  const [showDiscordConnectionModal, setShowDiscordConnectionModal] = useState(false)
  const [showExecutionHistory, setShowExecutionHistory] = useState(false)
  const [showSandboxPreview, setShowSandboxPreview] = useState(false)

  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationInfo | null>(null)
  const [selectedTrigger, setSelectedTrigger] = useState<NodeComponent | null>(null)
  const [selectedAction, setSelectedAction] = useState<NodeComponent | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterCategory, setFilterCategory] = useState("all")
  const [showConnectedOnly, setShowConnectedOnly] = useState(false)
  const [showComingSoon, setShowComingSoon] = useState(false)
  const [isActionAIMode, setIsActionAIMode] = useState(false)
  const [deletingNode, setDeletingNode] = useState<{ id: string; name: string } | null>(null)
  const [sourceAddNode, setSourceAddNode] = useState<{
    id: string
    parentId: string
    insertBefore?: string
  } | null>(null)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

  // OAuth loading state
  const [connectingIntegrationId, setConnectingIntegrationId] = useState<string | null>(null)

  // Sandbox state
  const [sandboxInterceptedActions, setSandboxInterceptedActions] = useState<any[]>([])

  // Loading state
  const [hasShownLoading, setHasShownLoading] = useState(false)

  const handleOpenTriggerDialog = useCallback(() => {
    setSelectedIntegration(null)
    setSelectedTrigger(null)
    setSearchQuery("")
    setShowTriggerDialog(true)
  }, [])

  const handleActionDialogClose = useCallback(() => {
    setShowActionDialog(false)
    setSelectedIntegration(null)
    setSelectedAction(null)
    setSourceAddNode(null)
    setSearchQuery("")
  }, [])

  const resetDialogStates = useCallback(() => {
    setSelectedIntegration(null)
    setSelectedTrigger(null)
    setSelectedAction(null)
    setSearchQuery("")
    setFilterCategory("all")
  }, [])

  const handleSaveAndNavigate = useCallback((onSave: () => Promise<void>) => {
    return async () => {
      try {
        await onSave()
        // Small delay to ensure hasUnsavedChanges state update completes
        await new Promise(resolve => setTimeout(resolve, 100))
        setShowUnsavedChangesModal(false)
        if (pendingNavigation) {
          window.location.href = pendingNavigation
          setPendingNavigation(null)
        }
      } catch (error) {
        logger.error('Failed to save before navigation:', error)
      }
    }
  }, [pendingNavigation])

  const handleNavigateWithoutSaving = useCallback(() => {
    setShowUnsavedChangesModal(false)
    if (pendingNavigation) {
      window.location.href = pendingNavigation
      setPendingNavigation(null)
    }
  }, [pendingNavigation])

  const handleNavigation = useCallback((hasUnsavedChanges: boolean, href: string) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(href)
      setShowUnsavedChangesModal(true)
      return true // Prevent default navigation
    }
    // Navigate immediately if no unsaved changes
    window.location.href = href
    return false // Allow navigation
  }, [])

  return {
    // Dialog states
    showTriggerDialog,
    setShowTriggerDialog,
    showActionDialog,
    setShowActionDialog,
    showUnsavedChangesModal,
    setShowUnsavedChangesModal,
    showDiscordConnectionModal,
    setShowDiscordConnectionModal,
    showExecutionHistory,
    setShowExecutionHistory,
    showSandboxPreview,
    setShowSandboxPreview,

    // Selection states
    selectedIntegration,
    setSelectedIntegration,
    selectedTrigger,
    setSelectedTrigger,
    selectedAction,
    setSelectedAction,
    deletingNode,
    setDeletingNode,
    sourceAddNode,
    setSourceAddNode,

    // Filter states
    searchQuery,
    setSearchQuery,
    filterCategory,
    setFilterCategory,
    showConnectedOnly,
    setShowConnectedOnly,
    showComingSoon,
    setShowComingSoon,
    isActionAIMode,
    setIsActionAIMode,

    // OAuth loading state
    connectingIntegrationId,
    setConnectingIntegrationId,

    // Sandbox state
    sandboxInterceptedActions,
    setSandboxInterceptedActions,

    // Loading state
    hasShownLoading,
    setHasShownLoading,

    // Navigation states
    pendingNavigation,
    setPendingNavigation,

    // Handler functions
    handleOpenTriggerDialog,
    handleActionDialogClose,
    resetDialogStates,
    handleSaveAndNavigate,
    handleNavigateWithoutSaving,
    handleNavigation,
  }
}