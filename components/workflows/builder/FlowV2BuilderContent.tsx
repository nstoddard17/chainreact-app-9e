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
import { CanvasBadge, type CanvasBadgeVariant } from "./ui/CanvasBadge"
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
  configuringNode: any
  setConfiguringNode: (node: any) => void

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
  configuringNode,
  setConfiguringNode,
  onUndoToPreviousStage,
  onCancelBuild,
}: FlowV2BuilderContentProps) {
  const reactFlowInstance = useRef<any>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

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

  // Enrich nodes with multi-select delete handler and selection info
  const enrichedNodes = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onDelete: handleDeleteFromContextMenu,
        onDeleteSelected: handleDeleteSelectedNodes,
        selectedNodeIds,
      }
    }))
  }, [nodes, handleDeleteFromContextMenu, handleDeleteSelectedNodes, selectedNodeIds])

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

  const rightPanelWidth = configuringNode ? 600 : (isIntegrationsPanelOpen ? 600 : 0)
  const leftInset = isAgentPanelOpen ? Math.min(agentPanelWidth, containerWidth) : 0
  const availableWidth = Math.max(containerWidth - leftInset - rightPanelWidth, 0)
  const badgeLeft = leftInset + availableWidth / 2
  const badgeMaxWidth = availableWidth > 0
    ? Math.min(Math.max(availableWidth - 32, 200), availableWidth)
    : 200

  const canvasBadgeText = useMemo(() => {
    switch (buildState) {
      case BuildState.THINKING:
      case BuildState.SUBTASKS:
      case BuildState.COLLECT_NODES:
      case BuildState.OUTLINE:
      case BuildState.PURPOSE:
        return "Planning workflow"
      case BuildState.BUILDING_SKELETON:
        return "Building workflow"
      case BuildState.WAITING_USER:
        return "Waiting for your input"
      case BuildState.PREPARING_NODE:
        return "Preparing nodes"
      case BuildState.TESTING_NODE:
        return "Testing nodes"
      case BuildState.COMPLETE:
        return "Flow ready"
      default:
        return "Workflow assistant"
    }
  }, [buildState])

  const canvasBadgeSubtext = useMemo(() => {
    if (!badge?.subtext) {
      if (buildState === BuildState.WAITING_USER) {
        return "Review the plan to continue"
      }
      if (buildState === BuildState.COMPLETE) {
        return undefined
      }
      return undefined
    }
    return badge.subtext
  }, [badge?.subtext, buildState])

  const badgeWrapperStyle: React.CSSProperties = {
    position: "absolute",
    top: 16,
    left: badgeLeft || 0,
    transform: "translateX(-50%)",
    maxWidth: badgeMaxWidth,
    pointerEvents: "none",
    zIndex: 12,
    padding: "0 8px",
  }

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
            fitView
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

          {/* Floating Badge - Top center */}
          {badge && availableWidth > 80 && (
            <div style={badgeWrapperStyle}>
              <CanvasBadge
                text={canvasBadgeText}
                subtext={canvasBadgeSubtext}
                variant={(() => {
                  if (badge?.variant === 'green' || buildState === BuildState.COMPLETE) return 'success'
                  if (badge?.variant === 'red') return 'error'
                  if (badge?.spinner || buildState === BuildState.WAITING_USER || buildState === BuildState.PREPARING_NODE || buildState === BuildState.TESTING_NODE) {
                    return 'waiting'
                  }
                  return 'active'
                })() as CanvasBadgeVariant}
                showDots={Boolean(badge?.dots)}
                showSpinner={Boolean(badge?.spinner)}
                reducedMotion={typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches}
              />
            </div>
          )}

          {/* Integrations Side Panel */}
          <div
            className={`absolute top-0 right-0 h-full w-[600px] transition-all duration-300 ease-in-out z-30 ${
              isIntegrationsPanelOpen && !configuringNode
                ? 'translate-x-0 opacity-100'
                : 'translate-x-full opacity-0'
            }`}
          >
            <IntegrationsSidePanel
              isOpen={isIntegrationsPanelOpen && !configuringNode}
              onClose={() => setIsIntegrationsPanelOpen(false)}
              onNodeSelect={onNodeSelect}
            />
          </div>

          {/* Configuration Side Panel */}
          <div
            className={`absolute top-0 right-0 h-full w-[600px] transition-all duration-300 ease-in-out z-30 ${
              configuringNode
                ? 'translate-x-0 opacity-100'
                : 'translate-x-full opacity-0'
            }`}
          >
            {configuringNode && (
              <div className="h-full w-full bg-background border-l border-border shadow-lg z-50 flex flex-col overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setConfiguringNode(null)}
                    className="h-8 w-8 hover:bg-accent"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <span className="flex-1 text-base font-semibold">
                    Configure Node
                  </span>
                </div>
                <div className="flex-1 p-4">
                  <p className="text-sm text-muted-foreground">
                    Configuration panel coming soon...
                  </p>
                </div>
              </div>
            )}
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
