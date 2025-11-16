"use client"

import React, { useMemo } from "react"
import { Plus } from "lucide-react"
import { EdgeLabelRenderer, Panel } from "@xyflow/react"

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
    if (!nodes || nodes.length === 0) {
      console.log('[PhantomEdgeOverlay] No nodes found')
      return null
    }

    // Sort nodes by Y position to find the last one
    const sortedNodes = [...nodes].sort((a, b) => a.position.y - b.position.y)
    const lastNode = sortedNodes[sortedNodes.length - 1]

    console.log('[PhantomEdgeOverlay] Last node:', {
      id: lastNode.id,
      type: lastNode.type,
      position: lastNode.position
    })

    return {
      id: lastNode.id,
      x: lastNode.position.x,
      y: lastNode.position.y,
    }
  }, [nodes])

  if (!lastNodeInfo) {
    console.log('[PhantomEdgeOverlay] Not rendering - no last node info')
    return null
  }

  // Calculate line positioning
  // Placeholder nodes are approximately 120px tall (measured from your screenshot)
  const nodeHeight = 120
  // Match the vertical distance between nodes (same as the spacing between trigger and action)
  const lineLength = 120
  const lineStartY = lastNodeInfo.y + nodeHeight
  const lineEndY = lineStartY + lineLength
  const buttonY = (lineStartY + lineEndY) / 2 // Position button at midpoint of line

  // Calculate center X - nodes are positioned from their top-left corner
  // Placeholder nodes are 360px wide, so center is at x + 180
  const centerX = lastNodeInfo.x + 180

  console.log('[PhantomEdgeOverlay] Rendering:', {
    nodePos: lastNodeInfo,
    centerX,
    lineStartY,
    lineEndY,
    buttonY,
    nodeHeight,
    lineLength
  })

  return (
    <>
      {/* SVG for the dashed line - positioned in flow coordinates using Panel */}
      <Panel position="top-left">
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          {/* Dashed line extending from last node - matches FlowEdge style */}
          <line
            x1={centerX}
            y1={lineStartY}
            x2={centerX}
            y2={lineEndY}
            stroke="#d0d6e0"
            strokeWidth="1.5"
            strokeDasharray="5,5"
            strokeLinecap="round"
          />
        </svg>
      </Panel>

      {/* Plus button using EdgeLabelRenderer for proper positioning (same as FlowEdge) */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${centerX}px, ${buttonY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
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
            aria-label="Add node after"
          >
            <Plus className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
