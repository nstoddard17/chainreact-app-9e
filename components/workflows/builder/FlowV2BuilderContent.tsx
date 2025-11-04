"use client"

/**
 * FlowV2BuilderContent.tsx
 *
 * Main canvas component extracted from WorkflowBuilderV2.
 * Contains ReactFlow, floating badge, and integrations panel.
 */

import React, { useRef, useCallback, useState, useMemo, useLayoutEffect } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  BackgroundVariant,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Button } from "@/components/ui/button"
import { Plus, ArrowRight, Trash2 } from "lucide-react"
import { IntegrationsSidePanel } from "./IntegrationsSidePanel"
import { Copy } from "./ui/copy"
import { BuildState, type BadgeInfo } from "@/src/lib/workflows/builder/BuildState"
import { defaultEdgeOptions } from "./FlowEdges"
import "./styles/tokens.css"
import "./styles/FlowBuilder.anim.css"
import styles from "./FlowV2Builder.module.css"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

interface FlowV2BuilderContentProps {
  // ReactFlow props
  nodes: any[]
  edges: any[]
  onNodesChange?: (changes: any) => void
  onEdgesChange?: (changes: any) => void
  onConnect?: (connection: any) => void
  nodeTypes: any // Required - provided by WorkflowBuilderV2
  edgeTypes: any // Required - provided by WorkflowBuilderV2
  onSelectionChange?: (params: any) => void
  onNodeDelete?: (nodeId: string) => void
  onDeleteNodes?: (nodeIds: string[]) => void
  onInit?: (instance: any) => void
  agentPanelWidth: number
  isAgentPanelOpen: boolean

  // Build state
  buildState: BuildState
  badge: BadgeInfo | null

  // Integrations panel
  isIntegrationsPanelOpen: boolean
  setIsIntegrationsPanelOpen: (open: boolean) => void
  onNodeSelect?: (nodeData: any) => void

  // Configuration panel
  onNodeConfigure?: (nodeId: string) => void

  // Toolbar actions
  onUndoToPreviousStage?: () => void
  onCancelBuild?: () => void
}

export function FlowV2BuilderContent({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  nodeTypes,
  edgeTypes,
  onSelectionChange,
  onNodeDelete,
  onDeleteNodes,
  onInit,
  agentPanelWidth,
  isAgentPanelOpen,
  buildState,
  badge,
  isIntegrationsPanelOpen,
  setIsIntegrationsPanelOpen,
  onNodeSelect,
  onNodeConfigure,
  onUndoToPreviousStage,
  onCancelBuild,
}: FlowV2BuilderContentProps) {
  const reactFlowInstance = useRef<any>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [integrationsPanelWidth, setIntegrationsPanelWidth] = useState(600)

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const element = containerRef.current

    const updateSize = () => {
      setContainerWidth(element.clientWidth)
    }

    updateSize()
    const resizeObserver = new ResizeObserver(() => updateSize())
    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Compute responsive integrations panel width
  useLayoutEffect(() => {
    const computeWidth = () => {
      if (typeof window === 'undefined') return 600
      const vw = window.innerWidth
      // Mobile (< 640px): Full width
      if (vw < 640) return vw
      // Tablet (640-1024px): 500px
      if (vw < 1024) return Math.min(500, vw * 0.9)
      // Desktop (>= 1024px): 600px
      return 600
    }

    const updateWidth = () => {
      setIntegrationsPanelWidth(computeWidth())
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Track selected nodes for multi-delete support
  const handleSelectionChangeInternal = useCallback((params: any) => {
    const selectedNodes = params?.nodes ?? []
    setSelectedNodeIds(selectedNodes.map((n: any) => n.id))

    // Call the original handler
    if (onSelectionChange) {
      onSelectionChange(params)
    }
  }, [onSelectionChange])

  // Handle node deletion via keyboard (Delete/Backspace) or context menu
  const handleNodesDelete = useCallback((deletedNodes: any[]) => {
    if (deletedNodes.length === 0) return

    const ids = deletedNodes.map(node => node.id)
    if (onDeleteNodes) {
      void onDeleteNodes(ids)
    } else if (onNodeDelete) {
      ids.forEach(id => onNodeDelete(id))
    }
  }, [onDeleteNodes, onNodeDelete])

  // Handle delete from context menu (single or multiple nodes)
  const handleDeleteFromContextMenu = useCallback((nodeId: string) => {
    const ids =
      selectedNodeIds.length > 1 && selectedNodeIds.includes(nodeId)
        ? [...selectedNodeIds]
        : [nodeId]

    if (onDeleteNodes) {
      void onDeleteNodes(ids)
    } else if (onNodeDelete) {
      ids.forEach(id => onNodeDelete(id))
    }
  }, [onDeleteNodes, onNodeDelete, selectedNodeIds])

  const handleDeleteSelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 0) return

    if (onDeleteNodes) {
      void onDeleteNodes([...selectedNodeIds])
    } else if (onNodeDelete) {
      selectedNodeIds.forEach(id => onNodeDelete(id))
    }
  }, [onDeleteNodes, onNodeDelete, selectedNodeIds])

  // Store the ReactFlow instance for coordinate conversion
  const handleInit = useCallback((instance: any) => {
    reactFlowInstance.current = instance
    if (onInit) {
      onInit(instance)
    }
  }, [onInit])

  // Handle drag over canvas
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  // Handle drop on canvas
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()

    if (!onNodeSelect || !reactFlowInstance.current) {
      return
    }

    try {
      const data = event.dataTransfer.getData('application/reactflow')
      if (!data) return

      const { type, nodeData } = JSON.parse(data)
      if (type !== 'node' || !nodeData) return

      // Convert screen coordinates to flow coordinates
      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      // Call the node select handler with position
      onNodeSelect({ ...nodeData, position })

    } catch (error) {
      console.error('Error handling node drop:', error)
    }
  }, [onNodeSelect])

  // Enrich nodes with multi-select delete handler, selection info, and configure callback
  const enrichedNodes = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onDelete: handleDeleteFromContextMenu,
        onDeleteSelected: handleDeleteSelectedNodes,
        onConfigure: onNodeConfigure,
        selectedNodeIds,
      }
    }))
  }, [nodes, handleDeleteFromContextMenu, handleDeleteSelectedNodes, onNodeConfigure, selectedNodeIds])

  // Get ARIA announcement text based on build state
  const getAriaAnnouncement = () => {
    switch (buildState) {
      case BuildState.THINKING:
        return Copy.thinking
      case BuildState.BUILDING_SKELETON:
        return Copy.buildingSkeleton
      case BuildState.WAITING_USER:
        return Copy.waitingUser
      case BuildState.PLAN_READY:
        return Copy.planReady
      case BuildState.COMPLETE:
        return Copy.flowReady
      default:
        return ''
    }
  }

  const rightPanelWidth = isIntegrationsPanelOpen ? integrationsPanelWidth : 0
  const leftInset = isAgentPanelOpen ? Math.min(agentPanelWidth, containerWidth) : 0
  const availableWidth = Math.max(containerWidth - leftInset - rightPanelWidth, 0)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={containerRef}
          style={{
            height: "100%",
            width: "100%",
            position: "relative",
            userSelect: "none",
            WebkitUserSelect: "none",
            MozUserSelect: "none",
            msUserSelect: "none"
          }}
          data-testid="flow-v2-builder"
        >
          <ReactFlow
            nodes={enrichedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodesDelete={handleNodesDelete}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onSelectionChange={handleSelectionChangeInternal}
            onInit={handleInit}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            deleteKeyCode={["Delete", "Backspace"]}
            fitView={
              buildState !== BuildState.BUILDING_SKELETON &&
              buildState !== BuildState.WAITING_USER &&
              buildState !== BuildState.PREPARING_NODE &&
              buildState !== BuildState.TESTING_NODE &&
              buildState !== BuildState.COMPLETE  // Don't auto-fit when workflow completes
            }
            fitViewOptions={{
              padding: 0.15,
              includeHiddenNodes: false,
              minZoom: 0.5,
              maxZoom: 1.5,
            }}
            className="bg-background"
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={defaultEdgeOptions}
            defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
          >
        <Background
          variant={BackgroundVariant.Dots}
          gap={8}
          size={1.5}
          color="hsl(var(--muted-foreground))"
          style={{ opacity: 0.5 }}
        />
        <Controls
          style={{
            position: 'absolute',
            bottom: '60px',
            left: '4px',
            top: 'auto',
          }}
          fitViewOptions={{
            padding: 0.2,
            includeHiddenNodes: false,
            minZoom: 0.5,
            maxZoom: 2,
          }}
        />

        {/* Add Node Button - Top right */}
        <Panel position="top-right" style={{ marginTop: '24px', marginRight: '24px' }}>
          <Button
            onClick={() => setIsIntegrationsPanelOpen(true)}
            size="sm"
            className="shadow-lg"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Node
          </Button>
        </Panel>
          </ReactFlow>


          {/* Integrations Side Panel */}
          <div
            className={`absolute top-0 right-0 h-full transition-all duration-300 ease-in-out z-30 ${
              isIntegrationsPanelOpen
                ? 'translate-x-0 opacity-100'
                : 'translate-x-full opacity-0'
            }`}
            style={{ width: `${integrationsPanelWidth}px` }}
          >
            <IntegrationsSidePanel
              isOpen={isIntegrationsPanelOpen}
              onClose={() => setIsIntegrationsPanelOpen(false)}
              onNodeSelect={onNodeSelect}
            />
          </div>


          {/* ARIA Live Region for accessibility announcements */}
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {getAriaAnnouncement()}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem
          disabled={selectedNodeIds.length === 0}
          onClick={handleDeleteSelectedNodes}
          className={selectedNodeIds.length === 0 ? "" : "text-destructive focus:text-destructive"}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {selectedNodeIds.length > 1
            ? `Delete ${selectedNodeIds.length} nodes`
            : "Delete selected node"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
