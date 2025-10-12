"use client"

import { ReactFlow, Background, Controls, MiniMap, Node, Edge, BackgroundVariant, ReactFlowProvider } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useMemo } from "react"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import CustomNode from "@/components/workflows/CustomNode"

import { logger } from '@/lib/utils/logger'

interface TemplatePreviewProps {
  nodes: any[]
  connections: any[]
  interactive?: boolean
  showControls?: boolean
  showMiniMap?: boolean
  className?: string
}

const nodeTypes = {
  custom: CustomNode
}

export function TemplatePreview({
  nodes = [],
  connections = [],
  interactive = false,
  showControls = false,
  showMiniMap = false,
  className = ""
}: TemplatePreviewProps) {
  const flowNodes: Node[] = useMemo(() => {
    // No-op functions for preview mode
    const noop = () => {}

    logger.debug('TemplatePreview - nodes:', nodes?.length, 'connections:', connections?.length)

    return nodes.map((node) => {
      // Get the node component definition
      const nodeType = node.data?.type || node.type
      const nodeComponent = ALL_NODE_COMPONENTS.find(n => n.type === nodeType)

      return {
        id: node.id,
        type: 'custom', // Always use custom type for proper rendering
        position: node.position || { x: 0, y: 0 },
        data: {
          ...node.data,
          // Ensure nodeComponent is present for CustomNode to render properly
          nodeComponent: node.data?.nodeComponent || nodeComponent,
          // Ensure all required fields are present
          title: node.data?.title || nodeComponent?.name || 'Node',
          description: node.data?.description || nodeComponent?.description || '',
          type: node.data?.type || nodeType || '',
          providerId: node.data?.providerId || nodeComponent?.providerId,
          isTrigger: node.data?.isTrigger || nodeComponent?.isTrigger || false,
          config: node.data?.config || {},
          // Add required callback functions (no-ops for preview)
          onConfigure: noop,
          onDelete: noop,
          onRename: noop,
        },
        draggable: false,
        selectable: false,
      }
    })
  }, [nodes])

  const flowEdges: Edge[] = useMemo(() => {
    return connections.map((conn) => ({
      id: conn.id || `e-${conn.source}-${conn.target}`,
      source: conn.source,
      target: conn.target,
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#d1d5db', strokeWidth: 1 },
    }))
  }, [connections])

  if (nodes.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-gray-50 rounded-lg ${className}`}>
        <p className="text-sm text-gray-400">No preview available</p>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ReactFlow
        key={`preview-${nodes.length}-${connections.length}`}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.2,
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        zoomOnScroll={interactive}
        zoomOnDoubleClick={false}
        panOnDrag={interactive}
        panOnScroll={false}
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#e2e8f0" />
        {showControls && (
          <Controls
            showInteractive={false}
            showZoom={true}
            showFitView={true}
          />
        )}
        {showMiniMap && (
          <MiniMap
            nodeColor={(node) => {
              if (node.data?.isTrigger) return '#3b82f6' // blue
              if (node.data?.type === 'ai_agent' || node.data?.type === 'ai_message') return '#8b5cf6' // purple
              return '#64748b' // slate
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        )}
      </ReactFlow>
    </div>
  )
}

export function TemplatePreviewWithProvider(props: TemplatePreviewProps) {
  return (
    <ReactFlowProvider>
      <TemplatePreview {...props} />
    </ReactFlowProvider>
  )
}
