"use client"

import React, { useMemo } from "react"
import { Plus } from "lucide-react"
import { EdgeLabelRenderer } from "@xyflow/react"
import { getCanvasDimensions, LAYOUT } from "./layout"

const HANDLE_OFFSET = 9

const DEFAULT_NODE_HEIGHT = 120
const DEFAULT_NODE_WIDTH = 360 // Match placeholder node width (w-[360px])

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

    const widthCandidates = [
      lastNode.width,
      lastNode.measured?.width,
      lastNode.__rf?.width,
      (lastNode.data as any)?.dimensions?.width,
    ]
    const heightCandidates = [
      lastNode.height,
      lastNode.measured?.height,
      lastNode.__rf?.height,
      (lastNode.data as any)?.dimensions?.height,
    ]

    const nodeWidth = widthCandidates.find((value) => Number.isFinite(value) && Number(value) > 0)
      ?? DEFAULT_NODE_WIDTH
    const nodeHeight = heightCandidates.find((value) => Number.isFinite(value) && Number(value) > 0)
      ?? DEFAULT_NODE_HEIGHT

    return {
      id: lastNode.id,
      position: { ...lastNode.position },
      x: lastNode.position.x,
      y: lastNode.position.y,
      width: Number(nodeWidth),
      height: Number(nodeHeight),
    }
  }, [nodes])

  if (!lastNodeInfo) {
    console.log('[PhantomEdgeOverlay] Not rendering - no last node info')
    return null
  }

  const { nodeGapY } = getCanvasDimensions()
  const verticalSpacing = Number.isFinite(nodeGapY) && nodeGapY > 0 ? nodeGapY : LAYOUT.nodeGapY
  const visibleGap = Math.max(verticalSpacing - HANDLE_OFFSET * 2, 0)

  const lineStartY = lastNodeInfo.y + lastNodeInfo.height - (HANDLE_OFFSET / 2)
  const lineLength = visibleGap
  const buttonY = lineStartY + lineLength
  const centerX = lastNodeInfo.x + lastNodeInfo.width / 2

  console.log('[PhantomEdgeOverlay] Rendering:', {
    nodePos: lastNodeInfo,
    centerX,
    lineStartY,
    buttonY,
    lineLength
  })

  return (
    <>
      {/* Dashed line using EdgeLabelRenderer positioned in flow coordinates */}
      <EdgeLabelRenderer>
        {/* Render line as a styled div instead of SVG */}
        <div
          style={{
            position: 'absolute',
            left: `${centerX}px`,
            top: `${lineStartY}px`,
            width: '2px',
            height: `${lineLength}px`,
            background: `repeating-linear-gradient(
              to bottom,
              #d0d6e0 0px,
              #d0d6e0 5px,
              transparent 5px,
              transparent 10px
            )`,
            pointerEvents: 'none',
            transform: 'translateX(-50%)',
          }}
        />

        {/* Plus button */}
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
