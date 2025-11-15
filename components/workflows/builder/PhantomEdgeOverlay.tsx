"use client"

import React, { useMemo } from "react"
import { Plus } from "lucide-react"
import { Panel } from "@xyflow/react"

interface PhantomEdgeOverlayProps {
  nodes: any[]
  onAddNode: (afterNodeId: string | null) => void
}

/**
 * PhantomEdgeOverlay - Renders a dashed line with plus button after the last node
 *
 * Uses ReactFlow Panel to position a vertical dashed line in flow coordinates
 * Plus button at the end of the line, matching FlowEdge styling
 */
export function PhantomEdgeOverlay({ nodes, onAddNode }: PhantomEdgeOverlayProps) {
  const lastNodeInfo = useMemo(() => {
    if (!nodes || nodes.length === 0) return null

    // Sort nodes by Y position to find the last one
    const sortedNodes = [...nodes].sort((a, b) => a.position.y - b.position.y)
    const lastNode = sortedNodes[sortedNodes.length - 1]

    return {
      id: lastNode.id,
      x: lastNode.position.x,
      y: lastNode.position.y,
    }
  }, [nodes])

  if (!lastNodeInfo) return null

  // Calculate line positioning
  const nodeHeight = 140 // Approximate node height for placeholder nodes (they're taller ~120-140px)
  const lineLength = 100 // Length of the phantom edge (matching typical edge length)
  const lineStartY = lastNodeInfo.y + nodeHeight
  const lineEndY = lineStartY + lineLength
  const buttonY = lineEndY

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 0,
      }}
      className="react-flow__edges"
    >
      {/* Dashed line extending from last node - matches FlowEdge style */}
      <line
        x1={lastNodeInfo.x}
        y1={lineStartY}
        x2={lastNodeInfo.x}
        y2={lineEndY}
        stroke="#d0d6e0"
        strokeWidth="1.5"
        strokeDasharray="5,5"
        strokeLinecap="round"
        className="dark:stroke-gray-600"
      />

      {/* Plus button at the end of the line - matches FlowEdge button style */}
      <foreignObject
        x={lastNodeInfo.x - 16}
        y={buttonY - 16}
        width={32}
        height={32}
        style={{ overflow: 'visible' }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            onAddNode(lastNodeInfo.id)
          }}
          className="
            group flex items-center justify-center
            w-8 h-8 rounded-full
            bg-white dark:bg-gray-800
            border-2 border-gray-300 dark:border-gray-600
            hover:border-blue-500 dark:hover:border-blue-400
            hover:bg-blue-50 dark:hover:bg-blue-900/20
            transition-all duration-200
            shadow-md hover:shadow-lg
            cursor-pointer
          "
          style={{ pointerEvents: 'auto' }}
          aria-label="Add node after"
        >
          <Plus className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
        </button>
      </foreignObject>
    </svg>
  )
}
