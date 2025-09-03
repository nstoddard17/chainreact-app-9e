import { useState, useCallback } from 'react'
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
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationInfo | null>(null)
  const [selectedTrigger, setSelectedTrigger] = useState<NodeComponent | null>(null)
  const [selectedAction, setSelectedAction] = useState<NodeComponent | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterCategory, setFilterCategory] = useState("all")
  const [showConnectedOnly, setShowConnectedOnly] = useState(true)
  const [deletingNode, setDeletingNode] = useState<{ id: string; name: string } | null>(null)
  const [sourceAddNode, setSourceAddNode] = useState<{ 
    id: string
    parentId: string
    insertBefore?: string 
  } | null>(null)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

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
        setShowUnsavedChangesModal(false)
        if (pendingNavigation) {
          window.location.href = pendingNavigation
          setPendingNavigation(null)
        }
      } catch (error) {
        console.error('Failed to save before navigation:', error)
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