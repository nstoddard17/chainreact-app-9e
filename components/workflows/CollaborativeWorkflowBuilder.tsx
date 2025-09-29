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

    // Configuration
    configuringNode,
    setConfiguringNode,
    pendingNode,
    setPendingNode,
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
    confirmDeleteNode,

    // Node operations (needed for chain nodes)
    handleDeleteNodeWithConfirmation,
    handleNodeConfigure,
    handleNodeDelete,
    handleAddNodeBetween,
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
        handleTestSandbox={handleTestSandbox}
        handleExecuteLive={handleExecuteLive}
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
            style: { strokeWidth: 1, stroke: 'hsl(var(--border))' },
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
          (() => {
            // Extract chain nodes and edges for this AI Agent
            let workflowData = { nodes: [], edges: [] }
            let initialData = configuringNode.config || {}

            // Always find the trigger node (if exists) - even for new AI Agents
            const triggerNode = nodes.find(n => n.data?.isTrigger === true)

            // If this is an existing AI Agent, extract its chain nodes from the workflow
            if (configuringNode.id !== 'pending-action') {
              // Find chain nodes for this AI Agent
              const chainNodes = nodes.filter(n =>
                n.data?.parentAIAgentId === configuringNode.id &&
                n.data?.type !== 'addAction'
              )

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
              chainNodes.forEach(node => {
                const chainIndex = node.data?.parentChainIndex ?? 0
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

                  return {
                    id: originalId,
                    type: node.type || 'custom',
                    position: node.position,
                    data: {
                      ...node.data,
                      type: node.data?.type,
                      title: node.data?.title || node.data?.label,
                      description: node.data?.description,
                      label: node.data?.label,
                      config: node.data?.config,
                      parentChainIndex: node.data?.parentChainIndex,
                      providerId: node.data?.providerId
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

              console.log('🔵 [AI Agent Open] Extracted chain data:', workflowData)
              console.log('🔵 [AI Agent Open] Reconstructed chains:', chains)
              console.log('🔵 [AI Agent Open] Initial data with chainsLayout:', initialData)
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
                console.log('🔵 [AI Agent Open] New AI Agent with trigger:', workflowData)
              }
            }

            return (
              <AIAgentConfigModal
                isOpen={!!configuringNode}
                onClose={() => setConfiguringNode(null)}
                initialData={initialData}
                workflowData={workflowData}
                currentNodeId={configuringNode.id}
                onSave={async (config) => {
              console.log('🔴 [AI Agent Save] Config received:', config)
              console.log('🔴 [AI Agent Save] chainsLayout:', config.chainsLayout)
              console.log('🔴 [AI Agent Save] pendingNode:', pendingNode)
              console.log('🔴 [AI Agent Save] configuringNode.id:', configuringNode.id)

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

              // Then process the chains if they exist
              // We need to do this after a small delay to ensure the AI Agent node has been created
              if (config.chainsLayout?.nodes && config.chainsLayout.nodes.length > 0) {
                console.log('🔵 [AI Agent Save] Processing chains from chainsLayout')
                const chainsLayout = config.chainsLayout
                const timestamp = Date.now()
                const aiAgentNodeId = finalNodeId

                // Use setTimeout to ensure the AI Agent node has been added to the workflow
                setTimeout(() => {
                  // Filter out chain placeholder nodes and only add actual action nodes
                  // Note: Nodes from AIAgentVisualChainBuilder have properties directly on the node, not nested in data
                  const actualActionNodes = chainsLayout.nodes.filter((n: any) =>
                    n.type !== 'chain_placeholder' &&
                    n.type !== undefined &&
                    n.type !== null
                  )

                  console.log('🔵 [AI Agent Save] Filtering nodes from chainsLayout:')
                  console.log('  - Total nodes:', chainsLayout.nodes.length)
                  console.log('  - Action nodes (non-placeholders):', actualActionNodes.length)
                  console.log('  - Filtered placeholder nodes:', chainsLayout.nodes.length - actualActionNodes.length)

                  if (actualActionNodes.length === 0) {
                    console.log('⚠️ [AI Agent Save] No action nodes to add (only placeholders found)')
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

                    console.log('🟢 [AI Agent Save] Found AI Agent node:', aiAgentNode.id)

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

                    console.log('🎯 [AI Agent Save] Position offset calculation:')
                    console.log('  - AI Agent in workflow:', aiAgentNode.position)
                    console.log('  - AI Agent in builder:', aiAgentPositionInBuilder)
                    console.log('  - Offset:', { x: offsetX, y: offsetY })

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
                      console.log('📦 [Chain Node] Original node from chainsLayout:', chainNode)
                      console.log('📦 [Chain Node] Original position:', chainNode.position)

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
                        onDelete: handleNodeDelete
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

                      console.log('📦 [Chain Node] New node created at position:', newNode.position)
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
                            x: newNode.position.x,
                            y: newNode.position.y + 150  // Added spacing between nodes
                          },
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

                    console.log('🟢 [AI Agent Save] Adding', allChainNodes.length, 'chain nodes and', addActionNodes.length, 'add action nodes')

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
                                            edge.source.startsWith('node-')  // Action nodes start with 'node-'
                        const targetIsValid = edge.target === 'ai-agent' ||
                                            validNodeIds.has(edge.target) ||
                                            edge.target.startsWith('node-')  // Action nodes start with 'node-'
                        // Exclude edges that involve placeholders
                        const sourceIsPlaceholder = edge.source.includes('chain-') || edge.source.includes('placeholder')
                        const targetIsPlaceholder = edge.target.includes('chain-') || edge.target.includes('placeholder')
                        return sourceIsValid && targetIsValid && !sourceIsPlaceholder && !targetIsPlaceholder
                      })

                      console.log('🔵 [AI Agent Save] Filtering edges:')
                      console.log('  - Total edges:', chainsLayout.edges.length)
                      console.log('  - Valid edges (non-placeholder):', validEdges.length)
                      console.log('  - Filtered edges:', chainsLayout.edges.length - validEdges.length)

                      // Add new edges from chainsLayout
                      const chainEdges = validEdges.map((edge: any) => {
                        const sourceId = edge.source.includes('node-')
                          ? `${aiAgentNodeId}-${edge.source}-${timestamp}`
                          : edge.source === 'ai-agent' ? aiAgentNodeId : edge.source
                        const targetId = edge.target.includes('node-')
                          ? `${aiAgentNodeId}-${edge.target}-${timestamp}`
                          : edge.target === 'ai-agent' ? aiAgentNodeId : edge.target

                        return {
                          ...edge,
                          id: `${aiAgentNodeId}-edge-${edge.id}-${timestamp}`,
                          source: sourceId,
                          target: targetId,
                          type: edge.type || 'custom',
                          // Add the onAddNode handler for edges between action nodes
                          data: {
                            ...edge.data,
                            onAddNode: () => {
                              // Open the action dialog to add a node between sourceId and targetId
                              console.log('Add node between', sourceId, 'and', targetId)
                              handleAddNodeBetween(sourceId, targetId)
                            }
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
                            type: 'custom',
                            animated: false,
                            style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5 5" }
                          }
                        })

                      console.log('🟢 [AI Agent Save] Adding', chainEdges.length, 'chain edges and', addActionEdges.length, 'add action edges')
                      return [...filteredEdges, ...chainEdges, ...addActionEdges]
                    })
                  }

                  // Fit view after adding all nodes and edges
                  setTimeout(() => {
                    if (fitView) {
                      fitView({
                        padding: 0.2,
                        includeHiddenNodes: false,
                        duration: 400,
                        maxZoom: 1,
                        minZoom: 0.5
                      })
                    }
                  }, 200) // Small delay to ensure nodes are rendered
                }, 100) // 100ms delay to ensure AI Agent node is created
              }
            }}
            currentNodeId={configuringNode.id}
            initialData={configuringNode.config}
            onActionSelect={aiAgentActionCallback ? (action) => aiAgentActionCallback(action.type, action.providerId, action.config) : undefined}
          />
            )
          })()
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
            workflowData={{ nodes, edges, id: currentWorkflow?.id }}
            currentNodeId={configuringNode.id}
            onSave={(config) => {
              // Check if this is a pending action (new node being added)
              const isPendingAction = configuringNode.id === 'pending-action' && pendingNode?.type === 'action'
              console.log('🟡 [ConfigurationModal] onSave called:', {
                configuringNodeId: configuringNode.id,
                isPendingAction,
                willPassHandleAddAction: isPendingAction,
                pendingNode: pendingNode,
                pendingNodeSourceNodeInfo: pendingNode?.sourceNodeInfo,
                sourceNodeInfoKeys: pendingNode?.sourceNodeInfo ? Object.keys(pendingNode.sourceNodeInfo) : []
              })

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

