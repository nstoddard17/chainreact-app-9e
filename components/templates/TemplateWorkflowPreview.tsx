"use client"

import React from 'react'
import { ReactFlow, Node, Edge, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/availableNodes'

interface TemplateWorkflowPreviewProps {
  nodes: any[]
  edges: any[]
  className?: string
}

/**
 * Mini workflow preview for template cards
 * Shows a simplified view of the workflow structure
 */
export function TemplateWorkflowPreview({ nodes, edges, className }: TemplateWorkflowPreviewProps) {
  // Transform template nodes to ReactFlow format
  const flowNodes: Node[] = (nodes || []).map(node => {
    const nodeDefinition = ALL_NODE_COMPONENTS.find(n => n.type === node.data?.type)
    const Icon = nodeDefinition?.icon

    return {
      id: node.id,
      type: 'custom',
      position: node.position || { x: 0, y: 0 },
      data: {
        ...node.data,
        icon: Icon,
        label: node.data?.title || nodeDefinition?.title || 'Node'
      }
    }
  })

  const flowEdges: Edge[] = (edges || []).map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: 'smoothstep'
  }))

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        panOnDrag={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={0.5}
        nodeTypes={{
          custom: MiniNode
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
      </ReactFlow>
    </div>
  )
}

/**
 * Simplified node component for preview
 */
function MiniNode({ data }: { data: any }) {
  const Icon = data.icon

  return (
    <div className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 shadow-sm">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3 text-gray-600 dark:text-gray-400" />}
        <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate max-w-[80px]">
          {data.label}
        </span>
      </div>
    </div>
  )
}
