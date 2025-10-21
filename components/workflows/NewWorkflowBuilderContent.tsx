"use client"

import React from "react"
import { ReactFlow, Background, Controls, Panel, BackgroundVariant } from "@xyflow/react"
import "@xyflow/react/dist/style.css"

// Custom hooks
import { useWorkflowBuilder } from "@/hooks/workflows/useWorkflowBuilder"

// Layout
import { BuilderLayout } from "./builder/BuilderLayout"

// Components
import { CollaboratorCursors } from "./CollaboratorCursors"
import { ConfigurationModal } from "./configuration"
import { AIAgentConfigModal } from "./AIAgentConfigModal"
import ErrorNotificationPopup from "./ErrorNotificationPopup"
import { ReAuthNotification } from "@/components/integrations/ReAuthNotification"
import { WorkflowLoadingScreen } from "@/components/ui/loading-screen"
import { TriggerSelectionDialog } from "./builder/TriggerSelectionDialog"
import { ActionSelectionDialog } from "./builder/ActionSelectionDialog"
import { UnsavedChangesModal } from "./builder/UnsavedChangesModal"
import { NodeDeletionModal } from "./builder/NodeDeletionModal"
import { ExecutionStatusPanel } from "./ExecutionStatusPanel"
import { TestModeDebugLog } from "./TestModeDebugLog"
import { PreflightCheckDialog } from "./PreflightCheckDialog"
import { TestModeDialog } from "./TestModeDialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { AirtableSetupPanel, type TemplateSetupData } from "@/components/templates/AirtableSetupPanel"
import { TemplateSetupDialog } from "@/components/templates/TemplateSetupDialog"
import { TemplateSettingsDrawer } from "./builder/TemplateSettingsDrawer"
import { IntegrationsSidePanel } from "./builder/IntegrationsSidePanel"

import { logger } from '@/lib/utils/logger'

export function NewWorkflowBuilderContent() {
  const {
    // React Flow state
    nodes,
    edges,
    onNodesChange,
    optimizedOnNodesChange,
    onEdgesChange,
    onConnect,
    nodeTypes,
    edgeTypes,
    getNodes,

    // Workflow metadata
    workflowName,
    setWorkflowName,
    currentWorkflow,
    editTemplateId,
    isTemplateEditing,

    // Loading/saving states
    isSaving,
    isLoading,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    listeningMode,

    // Handlers
    handleSave,
    handleToggleLive,
    isUpdatingStatus,
    handleTestSandbox,
    handleExecuteLive,
    handleExecuteLiveSequential,

    // Dialogs
    showTriggerDialog,
    setShowTriggerDialog,
    showActionDialog,
    setShowActionDialog,
    showUnsavedChangesModal,
    setShowUnsavedChangesModal,
    setShowExecutionHistory,
    deletingNode,
    setDeletingNode,
    handleOpenTriggerDialog,
    handleActionDialogClose,
    handleTriggerSelect,
    handleTriggerDialogClose,
    handleActionSelect,
    handleAddTrigger,
    handleAddAction,
    templateDraftMetadata,
    templatePublishedMetadata,
    updateTemplateDraftMetadata,
    saveTemplateDraft,
    isSavingTemplateDraft,
    templateAssets,
    uploadTemplateAsset,
    deleteTemplateAsset,
    templateSettingsLabel,

    // Execution state
    isExecuting,
    isStepMode,
    nodeStatuses,
    isListeningForWebhook,
    webhookTriggerType,
    usingTestData,
    testDataNodes,
    stopWebhookListening,
    skipToTestData,

    // Sandbox/Test mode
    testModeDialogOpen,
    setTestModeDialogOpen,
    isExecutingTest,
    handleRunTest,
    sandboxInterceptedActions,
    setSandboxInterceptedActions,
    showSandboxPreview,
    setShowSandboxPreview,

    // Configuration
    configuringNode,
    setConfiguringNode,
    pendingNode,
    handleSaveConfiguration,
    handleConfigurationClose,
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
    comingSoonIntegrations,
    confirmDeleteNode,

    // Node operations
    handleNodeConfigure,
    preflightResult,
    isPreflightDialogOpen,
    setIsPreflightDialogOpen,
    isRunningPreflight,
    openPreflightChecklist,

    // Undo/Redo
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,

    // Navigation handlers
    handleSaveAndNavigate,
    handleNavigateWithoutSaving,
    handleNavigation,

    // Edge selection
    handleEdgeClick,

    // Collaborators
    collaborators,
  } = useWorkflowBuilder()

  const [isTemplateSettingsOpen, setIsTemplateSettingsOpen] = React.useState(false)
  const [isIntegrationsPanelOpen, setIsIntegrationsPanelOpen] = React.useState(false)

  const sourceTemplateId = React.useMemo(
    () => currentWorkflow?.source_template_id || editTemplateId || null,
    [currentWorkflow?.source_template_id, editTemplateId]
  )

  const [templateSetupData, setTemplateSetupData] = React.useState<TemplateSetupData | null>(null)
  const [showTemplateSetupDialog, setShowTemplateSetupDialog] = React.useState(false)

  const templateSetupDialogKey = React.useMemo(() => {
    const keySource = currentWorkflow?.id || editTemplateId
    return keySource ? `template-setup-dialog-${keySource}` : null
  }, [currentWorkflow?.id, editTemplateId])

  const handleAirtableSetupLoaded = React.useCallback(
    (data: TemplateSetupData) => {
      setTemplateSetupData(data)
      if (typeof window === "undefined") return
      if (!templateSetupDialogKey) return

      const dismissed = localStorage.getItem(templateSetupDialogKey)
      if (!dismissed && data.requirements?.length) {
        setShowTemplateSetupDialog(true)
      }
    },
    [templateSetupDialogKey]
  )

  const handleTemplateSetupDialogChange = React.useCallback(
    (open: boolean) => {
      setShowTemplateSetupDialog(open)
      if (!open && templateSetupDialogKey && typeof window !== "undefined") {
        localStorage.setItem(templateSetupDialogKey, "dismissed")
      }
    },
    [templateSetupDialogKey]
  )

  const activeConfigNode = React.useMemo(() => {
    if (!configuringNode) return null
    return nodes.find((node) => node.id === configuringNode.id) || null
  }, [configuringNode, nodes])

  const handleOpenTemplateSettings = React.useCallback(() => {
    setIsTemplateSettingsOpen(true)
  }, [])

  const handleNodeSelectFromPanel = React.useCallback((node: any) => {
    // Create a pending node at the center of the viewport
    const position = {
      x: 400,
      y: 200,
    }

    setConfiguringNode({
      id: `temp-${Date.now()}`,
      nodeComponent: node,
      integration: null,
      config: {},
      position,
      sourceNodeId: undefined,
    })
  }, [setConfiguringNode])

  if (isLoading) {
    return <WorkflowLoadingScreen />
  }

  // Prepare header props
  const headerProps = {
    workflowName,
    setWorkflowName,
    hasUnsavedChanges,
    isSaving,
    isExecuting,
    handleSave,
    handleToggleLive,
    isUpdatingStatus,
    currentWorkflow,
    workflowId: currentWorkflow?.id,
    editTemplateId,
    isTemplateEditing,
    onOpenTemplateSettings: isTemplateEditing ? handleOpenTemplateSettings : undefined,
    templateSettingsLabel,
    handleTestSandbox,
    handleExecuteLive,
    handleExecuteLiveSequential,
    handleRunPreflight: openPreflightChecklist,
    isRunningPreflight,
    isStepMode,
    listeningMode,
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
    setShowExecutionHistory,
  }

  return (
    <BuilderLayout headerProps={headerProps} workflowId={currentWorkflow?.id || null}>
      {/* ReactFlow Canvas */}
      <div style={{ height: "100%", width: "100%", position: "relative" }}>
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={optimizedOnNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={handleEdgeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeDragStop={() => setHasUnsavedChanges(true)}
            fitView
            fitViewOptions={{
              padding: 0.2,
              includeHiddenNodes: false,
              minZoom: 0.5,
              maxZoom: 2,
            }}
            className="bg-background"
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: 'custom',
              style: {
                strokeWidth: 2,
                stroke: '#9ca3af',
                strokeLinecap: 'round',
                strokeLinejoin: 'round'
              },
              animated: false
            }}
            defaultViewport={{ x: 0, y: 0, zoom: 1.2 }}
          >
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="hsl(var(--muted))" />
            <Controls
              style={{
                position: 'absolute',
                bottom: '60px',
                left: '4px',
                top: 'auto'
              }}
              fitViewOptions={{
                padding: 0.2,
                includeHiddenNodes: false,
                minZoom: 0.5,
                maxZoom: 2,
              }}
            />
            <CollaboratorCursors collaborators={collaborators || []} />

            {/* Add Node Button */}
            <Panel position="top-right" style={{ marginTop: '10px', marginRight: '10px' }}>
              <Button
                onClick={() => setIsIntegrationsPanelOpen(true)}
                size="sm"
                className="shadow-lg"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Node
              </Button>
            </Panel>

            {/* Airtable Setup Panel */}
            {sourceTemplateId && (
              <Panel
                position="top-right"
                style={{ marginTop: '20px', marginRight: '10px' }}
                className="pointer-events-auto"
              >
                <div className="max-h-[70vh] w-[680px] min-w-[640px] overflow-y-auto overflow-x-hidden pr-6">
                  <AirtableSetupPanel
                    templateId={sourceTemplateId}
                    workflowId={currentWorkflow?.id}
                    onSetupLoaded={handleAirtableSetupLoaded}
                  />
                </div>
              </Panel>
            )}
          </ReactFlow>

        {/* Integrations Side Panel */}
        <IntegrationsSidePanel
          isOpen={isIntegrationsPanelOpen}
          onClose={() => setIsIntegrationsPanelOpen(false)}
          onNodeSelect={handleNodeSelectFromPanel}
        />
      </div>

      {/* Template Setup Dialog */}
      <TemplateSetupDialog
        open={showTemplateSetupDialog}
        onOpenChange={handleTemplateSetupDialogChange}
        data={templateSetupData}
      />

      {/* Template Settings Drawer */}
      {isTemplateEditing && templateDraftMetadata && (
        <TemplateSettingsDrawer
          open={isTemplateSettingsOpen}
          onOpenChange={setIsTemplateSettingsOpen}
          metadata={templateDraftMetadata}
          publishedMetadata={templatePublishedMetadata}
          onMetadataChange={updateTemplateDraftMetadata}
          onSave={() => saveTemplateDraft()}
          isSaving={isSavingTemplateDraft || isSaving}
          assets={templateAssets}
          onAssetUpload={uploadTemplateAsset}
          onAssetDelete={deleteTemplateAsset}
        />
      )}

      {/* Selection Dialogs */}
      <TriggerSelectionDialog
        open={showTriggerDialog}
        onOpenChange={handleTriggerDialogClose}
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
            open={!!configuringNode}
            onClose={handleConfigurationClose}
            currentNodeId={configuringNode.id}
            initialData={configuringNode.config}
            onSave={(config, chains) => {
              handleSaveConfiguration(
                { id: configuringNode.id },
                config,
                handleAddTrigger,
                undefined,
                handleSave,
                chains
              )
            }}
            onActionSelect={aiAgentActionCallback ? (action) => aiAgentActionCallback(action.type, action.providerId, action.config) : undefined}
            showActionDialog={showActionDialog}
            setShowActionDialog={setShowActionDialog}
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
            comingSoonIntegrations={comingSoonIntegrations}
            handleActionSelect={handleActionSelect}
            filterIntegrations={filterIntegrations}
            getDisplayedActions={getDisplayedActions}
            handleActionDialogClose={handleActionDialogClose}
            loadingIntegrations={loadingIntegrations}
            refreshIntegrations={refreshIntegrations}
          />
        ) : (
          <ConfigurationModal
            isOpen={!!configuringNode}
            onClose={handleConfigurationClose}
            onBack={() => {
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
            workflowData={{ nodes, edges, id: currentWorkflow?.id, name: workflowName || currentWorkflow?.name }}
            nodeTitle={activeConfigNode?.data?.title || configuringNode.nodeComponent?.title || configuringNode.nodeComponent?.label}
            currentNodeId={configuringNode.id}
            isTemplateEditing={isTemplateEditing}
            templateDefaults={templateDraftMetadata?.defaultFieldValues}
            onSave={(config) => {
              const isPendingAction = configuringNode.id === 'pending-action' && pendingNode?.type === 'action'
              handleSaveConfiguration(
                { id: configuringNode.id },
                config,
                handleAddTrigger,
                isPendingAction ? handleAddAction : undefined,
                handleSave
              )
            }}
          />
        )
      )}

      {/* Unsaved Changes Modal */}
      <UnsavedChangesModal
        open={showUnsavedChangesModal}
        onOpenChange={setShowUnsavedChangesModal}
        onSave={handleSaveAndNavigate(handleSave)}
        onDiscard={handleNavigateWithoutSaving}
        isSaving={isSaving}
      />

      {/* Node Deletion Modal */}
      {deletingNode && (
        <NodeDeletionModal
          open={!!deletingNode}
          onOpenChange={() => setDeletingNode(null)}
          nodeName={deletingNode.name}
          onConfirm={() => {
            if (confirmDeleteNode && deletingNode) {
              confirmDeleteNode(deletingNode.id)
            }
          }}
        />
      )}

      {/* Error and Auth Notifications */}
      <ErrorNotificationPopup workflowId={currentWorkflow?.id || ''} />
      <ReAuthNotification />

      {/* Execution Status Panel */}
      <ExecutionStatusPanel
        isListening={isListeningForWebhook || false}
        isExecuting={isExecuting}
        webhookTriggerType={webhookTriggerType || null}
        usingTestData={usingTestData || false}
        testDataNodes={testDataNodes || new Set()}
        nodeStatuses={nodeStatuses || {}}
        nodes={nodes}
        edges={edges}
        onSkip={(nodes, edges) => skipToTestData && skipToTestData(nodes, edges)}
        onStop={() => stopWebhookListening && stopWebhookListening()}
      />

      {/* Test Mode Debug Log */}
      <TestModeDebugLog
        isActive={isListeningForWebhook || isExecuting || false}
        onClear={() => {}}
      />

      {/* Preflight Check Dialog */}
      <PreflightCheckDialog
        open={isPreflightDialogOpen}
        onClose={() => setIsPreflightDialogOpen(false)}
        result={preflightResult}
        onRunAgain={() => openPreflightChecklist()}
        onFixNode={(nodeId) => {
          setIsPreflightDialogOpen(false)
          handleNodeConfigure(nodeId)
        }}
        onOpenIntegrations={() => handleNavigation(hasUnsavedChanges, "/integrations")}
        isRunning={isRunningPreflight}
      />

      {/* Test Mode Dialog */}
      <TestModeDialog
        open={testModeDialogOpen}
        onOpenChange={setTestModeDialogOpen}
        workflowId={currentWorkflow?.id || ''}
        triggerType={nodes.find(n => n.data?.isTrigger)?.data?.type}
        onRunTest={(config, mockVariation) => {
          handleRunTest(nodes, edges, config, mockVariation)
        }}
        interceptedActions={sandboxInterceptedActions}
        isExecuting={isExecuting || isExecutingTest}
      />
    </BuilderLayout>
  )
}
