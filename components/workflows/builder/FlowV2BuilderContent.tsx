"use client"

/**
 * FlowV2BuilderContent.tsx
 *
 * Main canvas component extracted from WorkflowBuilderV2.
 * Contains ReactFlow, floating badge, and integrations panel.
 */

import React, { useRef, useCallback } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  BackgroundVariant,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Button } from "@/components/ui/button"
import { Plus, ArrowRight } from "lucide-react"
import { IntegrationsSidePanel } from "./IntegrationsSidePanel"
import { Copy } from "./ui/copy"
import { BuildState, type BadgeInfo } from "@/src/lib/workflows/builder/BuildState"
import { flowNodeTypes } from "./FlowNodes"
import { flowEdgeTypes, defaultEdgeOptions } from "./FlowEdges"
import "./styles/tokens.css"
import "./styles/FlowBuilder.anim.css"
import styles from "./FlowV2Builder.module.css"

interface FlowV2BuilderContentProps {
  // ReactFlow props
  nodes: any[]
  edges: any[]
  onNodesChange?: (changes: any) => void
  onEdgesChange?: (changes: any) => void
  onConnect?: (connection: any) => void
  nodeTypes?: any
  edgeTypes?: any
  onSelectionChange?: (params: any) => void
  onInit?: (instance: any) => void

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
  onInit,
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

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }} data-testid="flow-v2-builder">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes || flowNodeTypes}
        edgeTypes={edgeTypes || flowEdgeTypes}
        onSelectionChange={onSelectionChange}
        onInit={onInit}
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
      {badge && (
        <div className={styles.badgeTopCenter}>
          <div className={`chip ${badge.variant}`}>
            {badge.spinner && <div className="spinner" />}
            {badge.dots && (
              <div className="bouncing-dots">
                <span />
                <span />
                <span />
              </div>
            )}
            <div>
              <div className="font-medium">{badge.text}</div>
              {badge.subtext && (
                <div className="text-xs opacity-75">{badge.subtext}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Integrations Side Panel */}
      <div
        className={`absolute top-0 right-0 h-full w-[600px] transition-all duration-300 ease-in-out ${
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
        className={`absolute top-0 right-0 h-full w-[600px] transition-all duration-300 ease-in-out ${
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
  )
}
