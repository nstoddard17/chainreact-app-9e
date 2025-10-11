"use client"

import React from "react"
import { ReactFlow, Background, Controls, Panel, BackgroundVariant, ReactFlowProvider } from "@xyflow/react"
import "@xyflow/react/dist/style.css"

// Custom hooks
import { useWorkflowBuilder } from "@/hooks/workflows/useWorkflowBuilder"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"

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
import { ExecutionStatusPanel } from "./ExecutionStatusPanel"
import { TestModeDebugLog } from "./TestModeDebugLog"
import { PreflightCheckDialog } from "./PreflightCheckDialog"

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
    setNodes,
    setEdges,
    onNodesChange,
    optimizedOnNodesChange,
    onEdgesChange,
    onConnect,
    nodeTypes,
    edgeTypes,
    fitView,
    getNodes,
    getEdges,

    // Workflow metadata
    workflowName,
    setWorkflowName,
    workflowDescription,
    setWorkflowDescription,
    currentWorkflow,
    editTemplateId,

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
    handleToggleLive,
    isUpdatingStatus,
    handleTestSandbox,
    handleExecuteLive,
    handleExecuteLiveSequential,
    handleConfigureNode,

    // Collaboration
    collaborators,

    // Dialogs
    showTriggerDialog,
    setShowTriggerDialog,
    showActionDialog,
    setShowActionDialog,
    showUnsavedChangesModal,
    setShowUnsavedChangesModal,
    showExecutionHistory,
    setShowExecutionHistory,
    showSandboxPreview,
    setShowSandboxPreview,
    deletingNode,
    setDeletingNode,
    handleOpenTriggerDialog,
    handleNavigation,
    handleActionDialogClose,
    handleTriggerSelect,
    handleTriggerDialogClose,
    handleActionSelect,
    handleAddActionClick,
    handleAddTrigger,
    handleAddAction,

    // Execution state
    isExecuting,
    activeExecutionNodeId,
    executionResults,
    isStepMode,
    sandboxInterceptedActions,
    nodeStatuses,
    isListeningForWebhook,
    webhookTriggerType,
    usingTestData,
    testDataNodes,
    stopWebhookListening,
    skipToTestData,

    // Configuration
    configuringNode,
    setConfiguringNode,
    pendingNode,
    setPendingNode,
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

    // Node operations (needed for chain nodes)
    handleDeleteNodeWithConfirmation,
    handleNodeConfigure,
    handleNodeDelete,
    handleNodeEditingStateChange,
    handleNodeRename,
    handleNodeAddChain,
    handleAddNodeBetween,
    ensureOneAddActionPerChain,
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

    // Edge selection and deletion
    selectedEdgeId,
    handleEdgeClick,
    deleteSelectedEdge,
  } = useWorkflowBuilder()

  const activeConfigNode = React.useMemo(() => {
    if (!configuringNode) return null
    return nodes.find((node) => node.id === configuringNode.id) || null
  }, [configuringNode, nodes])

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
    <div style={{ height: "100vh", position: "relative" }}>
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
        workflowStatus={currentWorkflow?.status}
        handleToggleLive={handleToggleLive}
        isUpdatingStatus={isUpdatingStatus}
        currentWorkflow={currentWorkflow}
        workflowId={currentWorkflow?.id}
        editTemplateId={editTemplateId}
        handleTestSandbox={handleTestSandbox}
        handleExecuteLive={handleExecuteLive}
        handleExecuteLiveSequential={handleExecuteLiveSequential}
        handleRunPreflight={openPreflightChecklist}
        isRunningPreflight={isRunningPreflight}
        isStepMode={isStepMode}
        showSandboxPreview={showSandboxPreview}
        setShowSandboxPreview={setShowSandboxPreview}
        sandboxInterceptedActions={sandboxInterceptedActions}
        showExecutionHistory={showExecutionHistory}
        setShowExecutionHistory={setShowExecutionHistory}
        getNodes={getNodes}
        getEdges={getEdges}
        setNodes={setNodes}
        setEdges={setEdges}
        handleConfigureNode={handleConfigureNode}
        ensureOneAddActionPerChain={ensureOneAddActionPerChain}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        selectedEdgeId={selectedEdgeId}
        deleteSelectedEdge={deleteSelectedEdge}
      />

      {nodes.length === 0 ? (
        <EmptyWorkflowState onAddTrigger={handleOpenTriggerDialog} />
      ) : (
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
            offset: { x: 0, y: 40 }
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
              offset: { x: 0, y: 40 }
            }}
          />
          <CollaboratorCursors collaborators={collaborators || []} />
        </ReactFlow>
      )}

      {/* Dialogs */}
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
          (() => {
            // Extract chain nodes and edges for this AI Agent
            let workflowData = { nodes: [], edges: [] }
            let initialData = configuringNode.config || {}

            // Always find the trigger node (if exists) - even for new AI Agents
            const triggerNode = nodes.find(n => n.data?.isTrigger === true)

            // If this is an existing AI Agent, extract its chain nodes from the workflow
            if (configuringNode.id !== 'pending-action') {
              // Find chain nodes for this AI Agent
              // First get nodes explicitly marked as children
              // Filter out UI nodes (addAction, chainPlaceholder)
              const explicitChainNodes = nodes.filter(n =>
                n.data?.parentAIAgentId === configuringNode.id &&
                n.data?.type !== 'addAction' &&
                n.data?.type !== 'chain_placeholder' &&
                n.type !== 'addAction' &&
                n.type !== 'chainPlaceholder'
              )

              // Also find nodes that are connected after the AI Agent (might not have parentAIAgentId)
              const connectedAfterAIAgent: any[] = []
              const findConnectedNodes = (nodeId: string, visited = new Set<string>()) => {
                if (visited.has(nodeId)) return
                visited.add(nodeId)

                // Find edges from this node
                const outgoingEdges = edges.filter(e => e.source === nodeId)
                for (const edge of outgoingEdges) {
                  const targetNode = nodes.find(n => n.id === edge.target)
                  if (targetNode &&
                      targetNode.data?.type !== 'addAction' &&
                      targetNode.data?.type !== 'chain_placeholder' &&
                      targetNode.data?.type !== 'ai_agent' &&
                      targetNode.type !== 'addAction' &&
                      targetNode.type !== 'chainPlaceholder' &&
                      !targetNode.data?.isTrigger) {
                    // Include this node if it's not already in explicit chain nodes
                    if (!explicitChainNodes.some(n => n.id === targetNode.id)) {
                      // Assign a chain index if it doesn't have one
                      const nodeWithChainIndex = {
                        ...targetNode,
                        data: {
                          ...targetNode.data,
                          parentChainIndex: targetNode.data?.parentChainIndex ?? 0
                        }
                      }
                      connectedAfterAIAgent.push(nodeWithChainIndex)
                    }
                    // Continue traversing
                    findConnectedNodes(targetNode.id, visited)
                  }
                }
              }

              // Start from the AI Agent node
              findConnectedNodes(configuringNode.id)

              // Combine both sets of nodes
              const chainNodes = [...explicitChainNodes, ...connectedAfterAIAgent]

              // Also find nodes between trigger and AI Agent (pre-processing nodes)
              const preprocessingNodes: any[] = []
              if (triggerNode) {
                // Find all nodes in the path from trigger to AI Agent
                const findNodesInPath = (startId: string, endId: string) => {
                  const pathNodes: any[] = []
                  const visited = new Set<string>()

                  const traverse = (nodeId: string) => {
                    if (visited.has(nodeId) || nodeId === endId) return
                    visited.add(nodeId)

                    // Find edges from this node
                    const outgoingEdges = edges.filter(e => e.source === nodeId)
                    for (const edge of outgoingEdges) {
                      const targetNode = nodes.find(n => n.id === edge.target)
                      if (targetNode &&
                          targetNode.id !== endId &&
                          !targetNode.data?.parentAIAgentId &&
                          targetNode.data?.type !== 'addAction') {
                        pathNodes.push(targetNode)
                        traverse(targetNode.id)
                      }
                    }
                  }

                  traverse(startId)
                  return pathNodes
                }

                preprocessingNodes.push(...findNodesInPath(triggerNode.id, configuringNode.id))
              }

              // Include trigger, preprocessing nodes, and chain nodes
              const allRelevantNodes = [
                ...(triggerNode ? [triggerNode] : []),
                ...preprocessingNodes,
                ...chainNodes
              ]
              const chainNodeIds = new Set(allRelevantNodes.map(n => n.id))

              // Get all edges connected to these nodes, including edges to/from the AI Agent
              const chainEdges = edges.filter(e =>
                chainNodeIds.has(e.source) || chainNodeIds.has(e.target) ||
                e.source === configuringNode.id || e.target === configuringNode.id
              )

              // Group chain nodes by chain index to reconstruct chains
              const chainGroups = new Map<number, any[]>()

              // First, determine chain indices by tracing edges from AI Agent
              const chainIndexMap = new Map<string, number>()
              const aiAgentEdges = edges.filter(e => e.source === configuringNode.id)

              // Sort edges by X position of target node to determine chain order (left to right)
              const sortedAIAgentEdges = aiAgentEdges
                .map(edge => {
                  const targetNode = nodes.find(n => n.id === edge.target)
                  return { edge, targetNode, x: targetNode?.position?.x || 0 }
                })
                .sort((a, b) => a.x - b.x)

              // Assign chain indices based on sorted order
              sortedAIAgentEdges.forEach(({ edge }, index) => {
                // Walk through the chain starting from this edge
                let currentNodeId = edge.target
                const visited = new Set<string>()

                while (currentNodeId && !visited.has(currentNodeId)) {
                  visited.add(currentNodeId)
                  chainIndexMap.set(currentNodeId, index)

                  // Find next node in chain
                  const nextEdge = edges.find(e =>
                    e.source === currentNodeId &&
                    !e.target.includes('add-action') &&
                    e.target !== configuringNode.id
                  )
                  currentNodeId = nextEdge?.target || null
                }
              })

              // Group nodes using determined chain indices
              chainNodes.forEach(node => {
                // Use the chain index from our map, fallback to node data, then to 0
                const chainIndex = chainIndexMap.get(node.id) ?? node.data?.parentChainIndex ?? 0

                // Update node data to include the determined chain index
                if (node.data?.parentChainIndex !== chainIndex) {
                  node.data = { ...node.data, parentChainIndex: chainIndex }
                }

                if (!chainGroups.has(chainIndex)) {
                  chainGroups.set(chainIndex, [])
                }
                chainGroups.get(chainIndex)!.push(node)
              })

              // Create chains array for the visual builder
              const chains = Array.from(chainGroups.entries())
                .sort(([a], [b]) => a - b)
                .map(([chainIndex, chainNodes]) => ({
                  id: `chain-${chainIndex}`,
                  nodes: chainNodes.map(n => n.id)
                }))

              // Convert to chain builder format (removing AI Agent ID prefix from node IDs)
              const aiAgentPrefix = `${configuringNode.id}-`
              workflowData = {
                nodes: allRelevantNodes.map(node => {
                  // Handle trigger node specially
                  if (node.data?.isTrigger) {
                    return {
                      id: 'trigger',
                      type: 'custom',
                      position: node.position,
                      data: {
                        ...node.data,
                        title: node.data?.title || 'Trigger',
                        description: node.data?.description || '',
                        isTrigger: true,
                        config: node.data?.config
                      }
                    }
                  }
                  // Handle chain nodes - preserve the original ID for mapping
                  const originalId = node.id.startsWith(aiAgentPrefix) ?
                    node.id.substring(aiAgentPrefix.length) :
                    node.id

                  // Get the node component definition to ensure we have the proper title and description
                  const nodeType = node.data?.type
                  const nodeComponent = nodeType ? ALL_NODE_COMPONENTS.find(n => n.type === nodeType) : null

                  return {
                    id: originalId,
                    type: node.type || 'custom',
                    position: node.position,
                    data: {
                      ...node.data,
                      type: node.data?.type,
                      title: node.data?.title || node.data?.label || nodeComponent?.title || 'Action',
                      description: node.data?.description || nodeComponent?.description || '',
                      label: node.data?.label,
                      config: node.data?.config,
                      parentChainIndex: node.data?.parentChainIndex ?? 0,
                      providerId: node.data?.providerId,
                      isAIAgentChild: node.data?.isAIAgentChild,
                      parentAIAgentId: node.data?.parentAIAgentId
                    }
                  }
                }),
                edges: chainEdges.map(edge => {
                  // Map trigger node IDs
                  const mapNodeId = (nodeId: string) => {
                    const triggerNode = nodes.find(n => n.id === nodeId && n.data?.isTrigger)
                    if (triggerNode) return 'trigger'

                    // Map AI Agent node ID
                    if (nodeId === configuringNode.id) return 'ai-agent'

                    return nodeId.startsWith(aiAgentPrefix) ?
                      nodeId.substring(aiAgentPrefix.length) :
                      nodeId
                  }

                  return {
                    id: edge.id,
                    source: mapNodeId(edge.source),
                    target: mapNodeId(edge.target),
                    type: edge.type || 'custom'
                  }
                })
              }

              // Find the actual AI Agent node position in the workflow
              const aiAgentNodeInWorkflow = nodes.find(n => n.id === configuringNode.id)
              const aiAgentWorkflowPosition = aiAgentNodeInWorkflow?.position || { x: 400, y: 200 }

              // Store the chains in initialData so they can be reconstructed in the modal
              initialData = {
                ...initialData,
                chains: chains,
                chainsLayout: {
                  nodes: workflowData.nodes,
                  edges: workflowData.edges,
                  chains: chains,
                  aiAgentPosition: aiAgentWorkflowPosition, // Use actual workflow position
                  workflowAIAgentPosition: aiAgentWorkflowPosition // Store for reference
                }
              }

              // console.log('🔵 [AI Agent Open] Extracted chain data:', workflowData)
              // console.log('🔵 [AI Agent Open] Reconstructed chains:', chains)
              console.log('🔵 [AI Agent Open] Opened with', chains.length, 'chains')
            } else {
              // For new AI Agents (pending-action), just include the trigger node
              if (triggerNode) {
                workflowData = {
                  nodes: [{
                    id: 'trigger',
                    type: 'custom',
                    position: triggerNode.position,
                    data: {
                      ...triggerNode.data,
                      title: triggerNode.data?.title || 'Trigger',
                      description: triggerNode.data?.description || '',
                      isTrigger: true,
                      config: triggerNode.data?.config
                    }
                  }],
                  edges: []
                }
                // console.log('🔵 [AI Agent Open] New AI Agent with trigger:', workflowData)
              }
            }

            return (
              <AIAgentConfigModal
                isOpen={!!configuringNode}
                onClose={() => setConfiguringNode(null)}
                initialData={initialData}
                workflowData={workflowData}
                currentNodeId={configuringNode.id}
                autoOpenActionSelector={configuringNode.autoOpenActionSelector}
                onSave={async (config) => {
              console.log('🔴 [AI Agent Save] Saving with', config.chainsLayout?.nodes?.length || 0, 'nodes in', (config.chainsLayout?.edges?.length || 0) > 0 ? 'chains' : 'placeholder mode')
              // console.log('🔴 [AI Agent Save] Config keys:', Object.keys(config))
              // console.log('🔴 [AI Agent Save] chainsLayout:', config.chainsLayout)
              // console.log('🔴 [AI Agent Save] pendingNode:', pendingNode)

              // Check if this is a pending node (new AI Agent being added)
              const isPendingNode = configuringNode.id === 'pending-action' && pendingNode?.type === 'action'
              let finalNodeId = configuringNode.id

              // First save the AI Agent configuration
              // If it's a pending node, this will create the AI Agent node and return its ID
              if (isPendingNode && pendingNode?.sourceNodeInfo) {
                // For pending nodes, we need to manually call handleAddAction to get the new node ID
                const newNodeId = handleAddAction(
                  pendingNode.integration,
                  pendingNode.nodeComponent,
                  config,
                  pendingNode.sourceNodeInfo
                )

                if (newNodeId) {
                  finalNodeId = newNodeId
                  console.log('🟢 [AI Agent Save] Created new AI Agent node with ID:', finalNodeId)
                }

                // Clear the pending state
                setPendingNode(null)
                setConfiguringNode(null)
              } else {
                // For existing nodes, just save the configuration
                await handleSaveConfiguration(
                  { id: configuringNode.id },
                  config,
                  handleAddTrigger,
                  handleAddAction,
                  handleSave
                )
              }

              // Then process the chains if they exist OR add a chain placeholder
              // We need to do this after a small delay to ensure the AI Agent node has been created
              const chainsLayoutNodes = config.chainsLayout?.nodes

              // Filter out placeholder nodes - we only want actual action nodes
              const actualActionNodes = chainsLayoutNodes?.filter((n: any) => {
                // Check if it's an actual action node (not a placeholder or UI node)
                const isPlaceholder = n.type === 'chain_placeholder' ||
                                    n.type === 'chainPlaceholder' ||
                                    n.data?.type === 'chain_placeholder' ||
                                    n.id?.includes('placeholder')
                const isUINode = n.type === 'trigger' || n.type === 'ai-agent' || n.type === 'addAction'
                const isValidActionNode = n.type && !isPlaceholder && !isUINode

                // Debug log for each node being evaluated
                if (n.type || n.data?.type) {
                  console.log('🔍 [AI Agent Save] Node filter check:', {
                    id: n.id,
                    type: n.type,
                    dataType: n.data?.type,
                    isPlaceholder,
                    isUINode,
                    isValidActionNode
                  })
                }

                return isValidActionNode
              }) || []

              const hasChains = actualActionNodes.length > 0
              const aiAgentNodeId = finalNodeId

              console.log('🔵 [AI Agent Save] Processing after save:', {
                hasChains,
                chainsLayoutNodes: chainsLayoutNodes,
                chainsLayoutNodesLength: chainsLayoutNodes?.length,
                actualActionNodesLength: actualActionNodes.length,
                actualActionNodes: actualActionNodes.map((n: any) => ({ id: n.id, type: n.type })),
                aiAgentNodeId,
                shouldAddPlaceholder: !hasChains,
                configKeys: Object.keys(config),
                chainsLayoutExists: !!config.chainsLayout
              })

              console.log(`📊 [AI Agent Save] Branch decision: ${hasChains ? 'HAS CHAINS (if block)' : 'NO CHAINS (else block - will add placeholder and fitView)'}`)

              if (hasChains) {
                console.log('✅ [AI Agent Save] Entering IF BLOCK - Adding', actualActionNodes.length, 'actual action nodes (excluding placeholders)')
                const chainsLayout = config.chainsLayout
                const timestamp = Date.now()

                // Use setTimeout to ensure the AI Agent node has been added to the workflow
                setTimeout(() => {
                  // Filter out chain placeholder nodes and only add actual action nodes
                  // Note: Nodes from AIAgentVisualChainBuilder have properties directly on the node, not nested in data
                  const actualActionNodes = chainsLayout.nodes.filter((n: any) =>
                    n.type !== 'chain_placeholder' &&
                    n.type !== undefined &&
                    n.type !== null
                  )

                  // console.log('🔵 [AI Agent Save] Filtering nodes:', chainsLayout.nodes.length, 'total,', actualActionNodes.length, 'action nodes')

                  if (actualActionNodes.length === 0) {
                    // console.log('⚠️ [AI Agent Save] No action nodes, adding chain placeholder')

                    // Add a chain placeholder (Add Chain button) for the AI Agent
                    setNodes((currentNodes) => {
                      // Get the AI Agent node
                      const aiAgentNode = currentNodes.find(n => n.id === aiAgentNodeId)
                      if (!aiAgentNode) {
                        console.error('AI Agent node not found! Looking for:', aiAgentNodeId)
                        return currentNodes
                      }

                      // Remove any existing Add Action button for this AI Agent
                      const filteredNodes = currentNodes.filter(n =>
                        !(n.type === 'addAction' && n.data?.parentId === aiAgentNodeId)
                      )

                      // Add a chain placeholder button
                      const chainPlaceholderId = `chain-placeholder-${aiAgentNodeId}`
                      const chainPlaceholderNode = {
                        id: chainPlaceholderId,
                        type: 'chainPlaceholder',
                        position: {
                          x: aiAgentNode.position.x, // Same width (480px) as AI Agent - no offset needed
                          y: aiAgentNode.position.y + 160
                        },
                        draggable: false,
                        selectable: false,
                        data: {
                          type: 'chain_placeholder', // Add the required type field
                          parentId: aiAgentNodeId,
                          parentAIAgentId: aiAgentNodeId,
                          onClick: () => {
                            // console.log('Chain placeholder clicked for AI Agent:', aiAgentNodeId)
                            // Open the action selection dialog
                            handleAddActionClick(chainPlaceholderId, aiAgentNodeId)
                          }
                        }
                      }

                      console.log('✅ [AI Agent Save] Added chain placeholder')
                      return [...filteredNodes, chainPlaceholderNode]
                    })

                    // Add edge from AI Agent to chain placeholder
                    if (setEdges) {
                      setEdges((currentEdges) => {
                        const chainPlaceholderId = `chain-placeholder-${aiAgentNodeId}`
                        const edgeId = `e-${aiAgentNodeId}-${chainPlaceholderId}`

                        // Check if edge already exists
                        const edgeExists = currentEdges.some(e => e.id === edgeId)
                        if (edgeExists) {
                          return currentEdges
                        }

                        const newEdge = {
                          id: edgeId,
                          source: aiAgentNodeId,
                          target: chainPlaceholderId,
                          type: 'straight',
                          animated: false,
                          style: { stroke: '#d1d5db', strokeWidth: 1, strokeDasharray: '5 5' }
                        }

                        return [...currentEdges, newEdge]
                      })
                    }

                    return
                  }

                  // Add chain nodes to the workflow
                  setNodes((currentNodes) => {
                    // Get the AI Agent node - it should exist now
                    const aiAgentNode = currentNodes.find(n => n.id === aiAgentNodeId)
                    if (!aiAgentNode) {
                      console.error('AI Agent node not found after delay! Looking for:', aiAgentNodeId)
                      console.error('Current nodes:', currentNodes.map(n => ({ id: n.id, type: n.data?.type })))
                      return currentNodes
                    }

                    // console.log('🟢 [AI Agent Save] Found AI Agent node:', aiAgentNode.id)

                    // Remove any existing chain nodes for this AI Agent
                    const filteredNodes = currentNodes.filter(n => {
                      const isChainNode = n.data?.parentAIAgentId === aiAgentNodeId ||
                                         n.id.startsWith(`${aiAgentNodeId}-node-`) ||
                                         n.id.includes(`${aiAgentNodeId}-chain`)
                      return !isChainNode
                    })

                    // Get AI Agent position from chain builder (if available)
                    const aiAgentPositionInBuilder = chainsLayout.aiAgentPosition || { x: 400, y: 200 }

                    // Calculate offset between chain builder AI Agent position and workflow AI Agent position
                    const offsetX = aiAgentNode.position.x - aiAgentPositionInBuilder.x
                    const offsetY = aiAgentNode.position.y - aiAgentPositionInBuilder.y

                    // console.log('🎯 [AI Agent Save] Offset:', { x: offsetX, y: offsetY })

                    // Group nodes by chain index to identify last node in each chain
                    const nodesByChain = new Map<number, any[]>()
                    actualActionNodes.forEach((chainNode: any) => {
                      const chainIndex = chainNode.parentChainIndex || 0
                      if (!nodesByChain.has(chainIndex)) {
                        nodesByChain.set(chainIndex, [])
                      }
                      nodesByChain.get(chainIndex)?.push(chainNode)
                    })

                    // Sort each chain's nodes by Y position
                    nodesByChain.forEach((nodes) => {
                      nodes.sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0))
                    })

                    // Add the new chain nodes from chainsLayout with exact positions
                    const allChainNodes: any[] = []
                    const addActionNodes: any[] = []

                    actualActionNodes.forEach((chainNode: any) => {
                      // console.log('📦 [Chain Node] Original position:', chainNode.position)

                      // Find the nodeComponent for this node type
                      const nodeType = chainNode.type || chainNode.data?.type || 'unknown'
                      const nodeComponent = ALL_NODE_COMPONENTS.find(nc => nc.type === nodeType)

                      const nodeData = {
                        type: nodeType,
                        title: chainNode.title || chainNode.data?.title || nodeComponent?.title || 'Action',
                        description: chainNode.description || chainNode.data?.description || nodeComponent?.description || '',
                        providerId: chainNode.providerId || chainNode.data?.providerId,
                        config: chainNode.config || chainNode.data?.config || {},
                        isAIAgentChild: true,
                        parentAIAgentId: aiAgentNodeId,
                        parentChainIndex: chainNode.parentChainIndex || chainNode.data?.parentChainIndex || 0,
                        // Add nodeComponent for configuration
                        nodeComponent: nodeComponent,
                        // Add integration info for configuration modal
                        integration: chainNode.integration || chainNode.data?.integration,
                        // Add handlers - these will be called with the node ID
                        onConfigure: handleNodeConfigure,
                        onDelete: handleNodeDelete,
                        onEditingStateChange: handleNodeEditingStateChange,
                        onRename: handleNodeRename
                      }

                      const newNodeId = `${aiAgentNodeId}-${chainNode.id}-${timestamp}`
                      const newNode = {
                        ...chainNode,
                        id: newNodeId,
                        type: 'custom', // ReactFlow node type
                        position: {
                          // Use exact position from chain builder with offset applied
                          x: (chainNode.position?.x || 0) + offsetX,
                          y: (chainNode.position?.y || 0) + offsetY
                        },
                        data: nodeData
                      }

                      // console.log('📦 [Chain Node] New node created at position:', newNode.position)
                      allChainNodes.push(newNode)

                      // Check if this is the last node in its chain
                      const chainIndex = chainNode.parentChainIndex || 0
                      const chainNodes = nodesByChain.get(chainIndex) || []
                      const isLastInChain = chainNodes[chainNodes.length - 1]?.id === chainNode.id

                      if (isLastInChain) {
                        const addActionId = `add-action-${newNodeId}`
                        const addActionNode = {
                          id: addActionId,
                          type: 'addAction',
                          position: {
                            x: newNode.position.x, // Keep same X for vertical alignment
                            y: newNode.position.y + 120 // Use 120px for AI agent chains
                          },
                          draggable: false, // Prevent Add Action nodes from being dragged
                          data: {
                            parentId: newNodeId,
                            parentAIAgentId: aiAgentNodeId,
                            parentChainIndex: chainIndex,
                            onClick: () => {
                              // Open the action dialog to add a new action
                              handleAddActionClick(addActionId, newNodeId)
                            }
                          }
                        }
                        addActionNodes.push(addActionNode)
                      }
                    })

                    // console.log('🟢 [AI Agent Save] Adding', allChainNodes.length, 'chain nodes and', addActionNodes.length, 'add action nodes')

                    // Remove the AddAction node that's directly after the AI Agent
                    const nodesWithoutAIAgentAddAction = filteredNodes.filter(n =>
                      !(n.type === 'addAction' && n.data?.parentId === aiAgentNodeId)
                    )

                    return [...nodesWithoutAIAgentAddAction, ...allChainNodes, ...addActionNodes]
                  })

                  // Add chain edges if available
                  if (chainsLayout.edges && setEdges) {
                    setEdges((currentEdges) => {
                      // Remove existing chain edges
                      const filteredEdges = currentEdges.filter(edge => {
                        const isChainEdge = edge.id?.includes(`${aiAgentNodeId}-`) ||
                                           edge.source?.includes(`${aiAgentNodeId}-`) ||
                                           edge.target?.includes(`${aiAgentNodeId}-`)
                        return !isChainEdge
                      })

                      // Only add edges that connect actual action nodes (not placeholders)
                      const validNodeIds = new Set(actualActionNodes.map((n: any) => n.id))
                      const validEdges = chainsLayout.edges.filter((edge: any) => {
                        // Check if both source and target are either actual nodes or the AI agent
                        // Note: IDs from AIAgentVisualChainBuilder might have different format
                        const sourceIsValid = edge.source === 'ai-agent' ||
                                            validNodeIds.has(edge.source) ||
                                            edge.source.startsWith('node-') // Action nodes start with 'node-'
                        const targetIsValid = edge.target === 'ai-agent' ||
                                            validNodeIds.has(edge.target) ||
                                            edge.target.startsWith('node-') // Action nodes start with 'node-'
                        // Exclude edges that involve placeholders
                        const sourceIsPlaceholder = edge.source.includes('chain-') || edge.source.includes('placeholder')
                        const targetIsPlaceholder = edge.target.includes('chain-') || edge.target.includes('placeholder')
                        return sourceIsValid && targetIsValid && !sourceIsPlaceholder && !targetIsPlaceholder
                      })

                      // console.log('🔵 [AI Agent Save] Filtering edges:', validEdges.length, 'valid edges')

                      // Add new edges from chainsLayout
                      const chainEdges = validEdges.map((edge: any) => {
                        const sourceId = edge.source.includes('node-')
                          ? `${aiAgentNodeId}-${edge.source}-${timestamp}`
                          : edge.source === 'ai-agent' ? aiAgentNodeId : edge.source
                        const targetId = edge.target.includes('node-')
                          ? `${aiAgentNodeId}-${edge.target}-${timestamp}`
                          : edge.target === 'ai-agent' ? aiAgentNodeId : edge.target

                        // Don't add insert button if target is an Add Action node
                        const isTargetAddAction = targetId.startsWith('add-action-')

                        return {
                          ...edge,
                          id: `${aiAgentNodeId}-edge-${edge.id}-${timestamp}`,
                          source: sourceId,
                          target: targetId,
                          type: edge.type || 'custom',
                          // Only add onAddNode handler if target is not an Add Action node
                          data: {
                            ...edge.data,
                            ...(isTargetAddAction ? {} : {
                              onAddNode: () => {
                                // Open the action dialog to add a node between sourceId and targetId
                                // console.log('Add node between', sourceId, 'and', targetId)
                                handleAddNodeBetween(sourceId, targetId)
                              }
                            })
                          }
                        }
                      })

                      // Add edges to AddAction nodes
                      const addActionEdges = actualActionNodes
                        .filter((_, index) => {
                          // Check if this is the last node in its chain
                          const chainIndex = actualActionNodes[index].parentChainIndex || 0
                          const chainNodes = actualActionNodes.filter(n => (n.parentChainIndex || 0) === chainIndex)
                          const sortedChainNodes = chainNodes.sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0))
                          return sortedChainNodes[sortedChainNodes.length - 1].id === actualActionNodes[index].id
                        })
                        .map((node: any) => {
                          const nodeId = `${aiAgentNodeId}-${node.id}-${timestamp}`
                          const addActionId = `add-action-${nodeId}`
                          return {
                            id: `e-${nodeId}-${addActionId}`,
                            source: nodeId,
                            target: addActionId,
                            type: 'straight',
                            animated: false,
                            style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5 5" }
                          }
                        })

                      // console.log('🟢 [AI Agent Save] Adding', chainEdges.length, 'chain edges and', addActionEdges.length, 'add action edges')
                      return [...filteredEdges, ...chainEdges, ...addActionEdges]
                    })
                  }

                  // Fit view after adding all nodes and edges
                  // Enhanced fitView with better timing and verification for chains
                  const performChainsFitView = () => {
                    let attempts = 0
                    const maxAttempts = 10

                    const attemptFitView = () => {
                      attempts++
                      const allNodes = getNodes()

                      // Check if we have the AI Agent and at least one chain node
                      const hasAIAgent = allNodes.some(n => n.id === aiAgentNodeId || n.data?.type === 'ai_agent')
                      const chainNodes = allNodes.filter(n =>
                        n.data?.isAIAgentChild === true ||
                        n.data?.parentAIAgentId === aiAgentNodeId ||
                        (typeof n.id === 'string' && n.id.startsWith(`${aiAgentNodeId}-`))
                      )
                      const hasChainNodes = chainNodes.length > 0

                      console.log(`🔍 [AI Agent Save] Chains FitView attempt ${attempts}: AI Agent: ${hasAIAgent}, Chain nodes: ${chainNodes.length}, Total nodes: ${allNodes.length}`)

                      if (hasAIAgent && hasChainNodes && fitView) {
                        // Nodes are ready, perform fitView
                        requestAnimationFrame(() => {
                          requestAnimationFrame(() => {
                            // Focus on the AI Agent and its chains
                            const relevantNodes = allNodes.filter(n =>
                              n.data?.type === 'ai_agent' ||
                              n.data?.isAIAgentChild === true ||
                              n.data?.parentAIAgentId === aiAgentNodeId ||
                              (typeof n.id === 'string' && n.id.startsWith(`${aiAgentNodeId}-`)) ||
                              n.type === 'addAction' ||
                              n.data?.isTrigger
                            )

                            fitView({
                              padding: 0.25,
                              includeHiddenNodes: false,
                              minZoom: 0.3,
                              maxZoom: 1.5,
                              duration: 800, // Smooth animation
                              nodes: relevantNodes.length > 0 ? relevantNodes : undefined
                            })
                            console.log('✅ [AI Agent Save] fitView completed successfully for chains')
                          })
                        })
                      } else if (attempts < maxAttempts) {
                        // Nodes not ready yet, try again
                        setTimeout(attemptFitView, 100)
                      } else {
                        console.warn('⚠️ [AI Agent Save] Could not perform fitView - chain nodes not ready after', maxAttempts, 'attempts')
                        // Fallback: try fitView anyway
                        if (fitView) {
                          fitView({
                            padding: 0.3,
                            includeHiddenNodes: false,
                            minZoom: 0.3,
                            maxZoom: 1.5,
                            duration: 500
                          })
                        }
                      }
                    }

                    // Start attempting fitView
                    attemptFitView()
                  }

                  // Start the fitView process with a shorter initial delay
                  // since we now have retry logic
                  setTimeout(() => {
                    performChainsFitView()
                  }, 150) // Reduced from 300ms since we have retry logic
                }, 100) // 100ms delay to ensure AI Agent node is created
              } else {
                // No chains at all - add a chain placeholder for the AI Agent
                console.log('📌 [AI Agent Save] ELSE BLOCK: No chains - adding placeholder')
                console.log('📌 [AI Agent Save] aiAgentNodeId:', aiAgentNodeId)
                console.log('📌 [AI Agent Save] isPendingNode:', isPendingNode)
                console.log('📌 [AI Agent Save] finalNodeId:', finalNodeId)
                console.log('📌 [AI Agent Save] fitView available:', !!fitView)
                console.log('📌 [AI Agent Save] getNodes available:', !!getNodes)

                // Use a longer delay for new nodes to ensure they're fully integrated into the workflow
                const delayTime = isPendingNode ? 300 : 100
                console.log('📌 [AI Agent Save] Using delay time:', delayTime, 'ms')

                setTimeout(() => {
                  console.log('📌 [AI Agent Save] TIMEOUT FIRED after', delayTime, 'ms')

                  // Add a chain placeholder (Add Chain button) for the AI Agent
                  setNodes((currentNodes) => {
                    console.log('📌 [Chain Placeholder] setNodes called')
                    console.log('📌 [Chain Placeholder] Current nodes count:', currentNodes.length)
                    console.log('📌 [Chain Placeholder] Current nodes:', currentNodes.map(n => ({ id: n.id, type: n.type, dataType: n.data?.type })))
                    console.log('📌 [Chain Placeholder] Looking for AI Agent with ID:', aiAgentNodeId)

                    // Get the AI Agent node - try both the ID and look for ai_agent type as fallback
                    let aiAgentNode = currentNodes.find(n => n.id === aiAgentNodeId)

                    // If not found by ID and it was a pending node, look for the most recent AI Agent
                    if (!aiAgentNode && isPendingNode) {
                      console.log('📌 [Chain Placeholder] Pending node - looking for AI Agent by type')
                      const aiAgentNodes = currentNodes.filter(n => n.data?.type === 'ai_agent')
                      console.log('📌 [Chain Placeholder] Found', aiAgentNodes.length, 'AI Agent nodes')
                      if (aiAgentNodes.length > 0) {
                        // Get the most recently added AI Agent (highest Y position typically)
                        aiAgentNode = aiAgentNodes[aiAgentNodes.length - 1]
                        console.log('📌 [Chain Placeholder] Found AI Agent by type:', aiAgentNode.id)
                      }
                    }

                    if (!aiAgentNode) {
                      console.error('❌ [Chain Placeholder] AI Agent node not found! Looking for:', aiAgentNodeId)
                      console.error('❌ [Chain Placeholder] Available node IDs:', currentNodes.map(n => n.id))
                      console.error('❌ [Chain Placeholder] Available node types:', currentNodes.map(n => n.data?.type))
                      console.error('❌ [Chain Placeholder] Was pending node:', isPendingNode)
                      return currentNodes
                    }

                    // Use the actual found node's ID for all operations
                    const actualAIAgentId = aiAgentNode.id

                    // Remove any existing Add Action button for this AI Agent
                    const filteredNodes = currentNodes.filter(n =>
                      !(n.type === 'addAction' && n.data?.parentId === actualAIAgentId) &&
                      !(n.type === 'chainPlaceholder' && n.data?.parentId === actualAIAgentId)
                    )

                    // Add a chain placeholder button
                    const chainPlaceholderId = `chain-placeholder-${actualAIAgentId}`
                    const chainPlaceholderNode = {
                      id: chainPlaceholderId,
                      type: 'chainPlaceholder',
                      position: {
                        x: aiAgentNode.position.x,
                        y: aiAgentNode.position.y + 160
                      },
                      draggable: false,
                      selectable: false,
                      data: {
                        type: 'chain_placeholder', // Add the required type field
                        parentId: actualAIAgentId,
                        parentAIAgentId: actualAIAgentId,
                        onClick: () => {
                          // console.log('Chain placeholder clicked for AI Agent:', actualAIAgentId)
                          // Open the action selection dialog
                          handleAddActionClick(chainPlaceholderId, actualAIAgentId)
                        }
                      }
                    }

                    console.log('✅ [Chain Placeholder] Added chain placeholder node successfully')
                    console.log('✅ [Chain Placeholder] Final nodes count:', [...filteredNodes, chainPlaceholderNode].length)
                    return [...filteredNodes, chainPlaceholderNode]
                  })

                  // Add edge from AI Agent to chain placeholder
                  console.log('📌 [AI Agent Save] About to add edge, setEdges available:', !!setEdges)
                  if (setEdges) {
                    setEdges((currentEdges) => {
                      console.log('📌 [Edge] setEdges called')
                      // Need to get the actual AI Agent ID again since this is a different closure
                      const allNodes = getNodes()
                      console.log('📌 [Edge] All nodes count:', allNodes.length)
                      let actualAIAgentId = aiAgentNodeId

                      // If it was a pending node, find the actual AI Agent
                      if (isPendingNode) {
                        const aiAgentNodes = allNodes.filter(n => n.data?.type === 'ai_agent')
                        console.log('📌 [Edge] Found', aiAgentNodes.length, 'AI Agent nodes for edge')
                        if (aiAgentNodes.length > 0) {
                          actualAIAgentId = aiAgentNodes[aiAgentNodes.length - 1].id
                          console.log('📌 [Edge] Using AI Agent ID for edge:', actualAIAgentId)
                        }
                      }

                      const chainPlaceholderId = `chain-placeholder-${actualAIAgentId}`
                      const edgeId = `e-${actualAIAgentId}-${chainPlaceholderId}`

                      // Remove any existing edge and add new one
                      const filteredEdges = currentEdges.filter(e => e.id !== edgeId)

                      const newEdge = {
                        id: edgeId,
                        source: actualAIAgentId,
                        target: chainPlaceholderId,
                        type: 'straight',
                        animated: false,
                        style: { stroke: '#d1d5db', strokeWidth: 1, strokeDasharray: '5 5' }
                      }

                      console.log('✅ [Edge] Added edge successfully:', edgeId)
                      return [...filteredEdges, newEdge]
                    })
                  } else {
                    console.warn('⚠️ [AI Agent Save] setEdges is not available!')
                  }

                  // Fit view after adding chain placeholder
                  // Enhanced fitView with better timing and verification
                  console.log('📌 [AI Agent Save] Setting up performFitView function')
                  const performFitView = () => {
                    console.log('🎯 [FitView] performFitView called')
                    let attempts = 0
                    const maxAttempts = 10

                    const attemptFitView = () => {
                      attempts++
                      console.log(`🔄 [FitView] Attempt ${attempts}/${maxAttempts}`)
                      const allNodes = getNodes()
                      console.log(`🔄 [FitView] Total nodes available:`, allNodes.length)

                      // Get the actual AI Agent ID (might be different if it was a pending node)
                      const aiAgentNodes = allNodes.filter(n => n.data?.type === 'ai_agent')
                      const currentAIAgentId = aiAgentNodes.length > 0 ? aiAgentNodes[aiAgentNodes.length - 1].id : aiAgentNodeId

                      // Check if we have the AI Agent and chain placeholder
                      const hasAIAgent = allNodes.some(n => n.id === currentAIAgentId || n.data?.type === 'ai_agent')
                      const hasChainPlaceholder = allNodes.some(n => n.type === 'chainPlaceholder')

                      console.log(`🔍 [FitView] Status check:`)
                      console.log(`  - AI Agent present: ${hasAIAgent}`)
                      console.log(`  - Chain Placeholder present: ${hasChainPlaceholder}`)
                      console.log(`  - fitView function available: ${!!fitView}`)
                      console.log(`  - Current AI Agent ID: ${currentAIAgentId}`)
                      console.log(`  - All node types:`, allNodes.map(n => n.type || n.data?.type))

                      if (hasAIAgent && hasChainPlaceholder && fitView) {
                        console.log('✅ [FitView] All conditions met, performing fitView')
                        // Both nodes are present, perform fitView
                        const relevantNodes = allNodes.filter(n =>
                          n.data?.type === 'ai_agent' ||
                          n.type === 'chainPlaceholder' ||
                          n.data?.isTrigger
                        )
                        console.log('✅ [FitView] Focusing on', relevantNodes.length, 'relevant nodes')

                        requestAnimationFrame(() => {
                          requestAnimationFrame(() => {
                            console.log('🎬 [FitView] Calling fitView with params')
                            fitView({
                              padding: 0.25,
                              includeHiddenNodes: false,
                              minZoom: 0.3,
                              maxZoom: 1.5,
                              duration: 800, // Smooth animation
                              nodes: relevantNodes // Focus on relevant nodes
                            })
                            console.log('✅ [FitView] fitView completed successfully for chain placeholder')
                          })
                        })
                      } else if (attempts < maxAttempts) {
                        console.log(`⏳ [FitView] Conditions not met yet, retrying in 100ms`)
                        // Nodes not ready yet, try again
                        setTimeout(attemptFitView, 100)
                      } else {
                        console.warn('⚠️ [AI Agent Save] Could not perform fitView - nodes not ready after', maxAttempts, 'attempts')
                        // Fallback: try fitView anyway
                        if (fitView) {
                          fitView({
                            padding: 0.3,
                            includeHiddenNodes: false,
                            minZoom: 0.3,
                            maxZoom: 1.5,
                            duration: 500
                          })
                        }
                      }
                    }

                    // Start attempting fitView
                    console.log('🚀 [FitView] Starting attemptFitView')
                    attemptFitView()
                  }

                  // Start the fitView process with a shorter initial delay
                  // since we now have retry logic
                  console.log('⏰ [AI Agent Save] Setting timeout to call performFitView in 150ms')
                  setTimeout(() => {
                    console.log('⏰ [AI Agent Save] Timeout fired, calling performFitView')
                    performFitView()
                  }, 150) // Reduced from 300ms since we have retry logic
                }, delayTime) // Use same delay as nodes
              }
              console.log('🏁 [AI Agent Save] End of else block (no chains case)')
            }}
            currentNodeId={configuringNode.id}
            initialData={configuringNode.config}
            onActionSelect={aiAgentActionCallback ? (action) => aiAgentActionCallback(action.type, action.providerId, action.config) : undefined}
            // Action dialog props - shared with workflow builder
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
            )
          })()
        ) : (
          <ConfigurationModal
            isOpen={!!configuringNode}
            onClose={handleConfigurationClose}
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
            workflowData={{ nodes, edges, id: currentWorkflow?.id, name: workflowName || currentWorkflow?.name }}
            nodeTitle={activeConfigNode?.data?.title || configuringNode.nodeComponent?.title || configuringNode.nodeComponent?.label}
            currentNodeId={configuringNode.id}
            onSave={(config) => {
              // Check if this is a pending action (new node being added)
              const isPendingAction = configuringNode.id === 'pending-action' && pendingNode?.type === 'action'
              // console.log('🟡 [ConfigurationModal] onSave called:', {
              //   configuringNodeId: configuringNode.id,
              //   isPendingAction,
              //   willPassHandleAddAction: isPendingAction,
              //   pendingNode: pendingNode,
              //   pendingNodeSourceNodeInfo: pendingNode?.sourceNodeInfo,
              //   sourceNodeInfoKeys: pendingNode?.sourceNodeInfo ? Object.keys(pendingNode.sourceNodeInfo) : []
              // })

              handleSaveConfiguration(
                { id: configuringNode.id },
                config,
                handleAddTrigger,
                isPendingAction ? handleAddAction : undefined, // Pass handleAddAction only for pending actions
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
            // Actually delete the node
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
