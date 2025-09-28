"use client"

import React from "react"
import { ReactFlow, Background, Controls, Panel, BackgroundVariant, ReactFlowProvider } from "@xyflow/react"
import "@xyflow/react/dist/style.css"

// Custom hooks
import { useWorkflowBuilder } from "@/hooks/workflows/useWorkflowBuilder"

// Components
import { CollaboratorCursors } from "./CollaboratorCursors"
import { ConfigurationModal } from "./configuration"
import { AIAgentConfigModal } from "./AIAgentConfigModal"
import ErrorNotificationPopup from "./ErrorNotificationPopup"
import { ReAuthNotification } from "@/components/integrations/ReAuthNotification"
import { WorkflowLoadingScreen } from "@/components/ui/loading-screen"
import { WorkflowToolbar } from "./builder/WorkflowToolbar"
import { TriggerSelectionDialog } from "./builder/TriggerSelectionDialog"
import { ActionSelectionDialog } from "./builder/ActionSelectionDialog"
import { EmptyWorkflowState } from "./builder/EmptyWorkflowState"
import { UnsavedChangesModal } from "./builder/UnsavedChangesModal"
import { NodeDeletionModal } from "./builder/NodeDeletionModal"

// UI Components
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ArrowLeft } from "lucide-react"

function WorkflowBuilderContent() {
  const {
    // React Flow state
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    nodeTypes,
    edgeTypes,
    fitView,
    
    // Workflow metadata
    workflowName,
    setWorkflowName,
    workflowDescription,
    setWorkflowDescription,
    currentWorkflow,
    
    // Loading/saving states
    isSaving,
    isLoading,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    listeningMode,
    setListeningMode,
    
    // Handlers
    handleSave,
    handleExecute,
    handleResetLoadingStates,
    
    // Collaboration
    collaborators,
    
    // Dialogs
    showTriggerDialog,
    setShowTriggerDialog,
    showActionDialog,
    setShowActionDialog,
    showUnsavedChangesModal,
    setShowUnsavedChangesModal,
    deletingNode,
    setDeletingNode,
    handleOpenTriggerDialog,
    handleNavigation,
    handleActionDialogClose,
    handleTriggerSelect,
    handleActionSelect,
    handleAddActionClick,
    handleAddTrigger,
    handleAddAction,
    
    // Execution state
    isExecuting,
    activeExecutionNodeId,
    executionResults,
    
    // Configuration
    configuringNode,
    setConfiguringNode,
    pendingNode,
    handleSaveConfiguration,
    aiAgentActionCallback,
    
    // Integration selection
    selectedIntegration,
    setSelectedIntegration,
    selectedTrigger,
    setSelectedTrigger,
    selectedAction,
    setSelectedAction,
    searchQuery,
    setSearchQuery,
    filterCategory,
    setFilterCategory,
    showConnectedOnly,
    setShowConnectedOnly,
    availableIntegrations,
    renderLogo,
    categories,
    isIntegrationConnected,
    filterIntegrations,
    getDisplayedTriggers,
    getDisplayedActions,
    loadingIntegrations,
    refreshIntegrations,
  } = useWorkflowBuilder()

  const getWorkflowStatus = () => {
    if (isExecuting) return { text: "Executing", variant: "default" as const }
    if (isSaving) return { text: "Saving", variant: "secondary" as const }
    if (hasUnsavedChanges) return { text: "Draft", variant: "outline" as const }
    return { text: "Saved", variant: "secondary" as const }
  }

  if (isLoading) {
    return <WorkflowLoadingScreen />
  }

  return (
    <div style={{ height: "calc(100vh - 65px)", position: "relative" }}>
      {/* Top Toolbar */}
      <WorkflowToolbar
        workflowName={workflowName}
        setWorkflowName={setWorkflowName}
        hasUnsavedChanges={hasUnsavedChanges}
        isSaving={isSaving}
        isExecuting={isExecuting}
        listeningMode={listeningMode}
        getWorkflowStatus={getWorkflowStatus}
        handleSave={handleSave}
        handleExecute={() => handleExecute(nodes, edges)}
        handleResetLoadingStates={handleResetLoadingStates}
        handleNavigation={(href) => handleNavigation(hasUnsavedChanges, href)}
      />

      {nodes.length === 0 ? (
        <EmptyWorkflowState onAddTrigger={handleOpenTriggerDialog} />
      ) : (
        <ReactFlow 
          nodes={nodes} 
          edges={edges} 
          onNodesChange={onNodesChange} 
          onEdgesChange={onEdgesChange} 
          onConnect={onConnect} 
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeDragStop={() => setHasUnsavedChanges(true)}
          fitView 
          className="bg-background" 
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: 'custom',
            style: { strokeWidth: 1, stroke: 'hsl(var(--border))' },
            animated: false
          }}
          defaultViewport={{ x: 0, y: 0, zoom: 1.2 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="hsl(var(--muted))" />
          <Controls className="left-4 bottom-4 top-auto" />
          <CollaboratorCursors collaborators={collaborators || []} />
        </ReactFlow>
      )}

      {/* Dialogs */}
      <TriggerSelectionDialog
        open={showTriggerDialog}
        onOpenChange={setShowTriggerDialog}
        selectedIntegration={selectedIntegration}
        setSelectedIntegration={setSelectedIntegration}
        selectedTrigger={selectedTrigger}
        setSelectedTrigger={setSelectedTrigger}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
        showConnectedOnly={showConnectedOnly}
        setShowConnectedOnly={setShowConnectedOnly}
        availableIntegrations={availableIntegrations}
        categories={categories}
        renderLogo={renderLogo}
        isIntegrationConnected={isIntegrationConnected}
        filterIntegrations={filterIntegrations}
        getDisplayedTriggers={getDisplayedTriggers}
        onTriggerSelect={handleTriggerSelect}
        loadingIntegrations={loadingIntegrations}
        refreshIntegrations={refreshIntegrations}
      />

      <ActionSelectionDialog
        open={showActionDialog}
        onOpenChange={setShowActionDialog}
        selectedIntegration={selectedIntegration}
        setSelectedIntegration={setSelectedIntegration}
        selectedAction={selectedAction}
        setSelectedAction={setSelectedAction}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
        showConnectedOnly={showConnectedOnly}
        setShowConnectedOnly={setShowConnectedOnly}
        availableIntegrations={availableIntegrations}
        categories={categories}
        renderLogo={renderLogo}
        isIntegrationConnected={isIntegrationConnected}
        filterIntegrations={filterIntegrations}
        getDisplayedActions={getDisplayedActions}
        onActionSelect={handleActionSelect}
        handleActionDialogClose={handleActionDialogClose}
        nodes={nodes}
        loadingIntegrations={loadingIntegrations}
        refreshIntegrations={refreshIntegrations}
      />

      {/* Configuration Modals */}
      {configuringNode && (
        configuringNode.nodeComponent.type === 'ai_agent' ? (
          <AIAgentConfigModal
            isOpen={!!configuringNode}
            onClose={() => setConfiguringNode(null)}
            onSave={(config) => handleSaveConfiguration(
              { id: configuringNode.id },
              config,
              handleAddTrigger,
              handleAddAction,
              handleSave
            )}
            currentNodeId={configuringNode.id}
            initialData={configuringNode.config}
            onActionSelect={aiAgentActionCallback ? (action) => aiAgentActionCallback(action.type, action.providerId, action.config) : undefined}
          />
        ) : (
          <ConfigurationModal
            isOpen={!!configuringNode}
            onClose={() => setConfiguringNode(null)}
            onBack={() => {
              // Close configuration modal and reopen the appropriate selection dialog
              const isPendingTrigger = configuringNode.id === 'pending-trigger'
              const isPendingAction = configuringNode.id === 'pending-action'
              setConfiguringNode(null)
              
              if (isPendingTrigger) {
                setShowTriggerDialog(true)
              } else if (isPendingAction) {
                setShowActionDialog(true)
              }
            }}
            nodeInfo={configuringNode.nodeComponent}
            integrationName={configuringNode.integration?.name || ''}
            initialData={configuringNode.config}
            onSave={(config) => handleSaveConfiguration(
              { id: configuringNode.id },
              config,
              handleAddTrigger,
              handleAddAction,
              handleSave
            )}
          />
        )
      )}

      {/* Unsaved Changes Modal */}
      <UnsavedChangesModal
        open={showUnsavedChangesModal}
        onOpenChange={setShowUnsavedChangesModal}
        onSave={() => handleSave().then(() => setShowUnsavedChangesModal(false))}
        onDiscard={() => setShowUnsavedChangesModal(false)}
      />

      {/* Node Deletion Modal */}
      {deletingNode && (
        <NodeDeletionModal
          open={!!deletingNode}
          onOpenChange={() => setDeletingNode(null)}
          nodeName={deletingNode.name}
          onConfirm={() => {
            // Handle node deletion
            console.log('Delete node:', deletingNode.id)
            setDeletingNode(null)
          }}
        />
      )}

      {/* Error and Auth Notifications */}
      <ErrorNotificationPopup workflowId={currentWorkflow?.id || ''} />
      <ReAuthNotification />
    </div>
  )
}

export default function CollaborativeWorkflowBuilder() {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderContent />
    </ReactFlowProvider>
  )
}