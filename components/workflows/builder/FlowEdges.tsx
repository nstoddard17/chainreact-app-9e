/**
 * FlowEdges.tsx
 *
 * Consistent edge styling for all workflows.
 * Features: 1.5px stroke, subtle color, straight lines, small arrowheads, + buttons.
 */

import React from 'react'
import { type EdgeProps, useStore, EdgeLabelRenderer, Position } from '@xyflow/react'
import { Plus } from 'lucide-react'

const ELSE_HANDLE_COLOR = '#64748B'
const DEFAULT_PATH_COLORS = ['#2563EB', '#EA580C', '#059669', '#9333EA', '#BE123C', '#14B8A6']
const DEFAULT_NODE_WIDTH = 360
const DEFAULT_NODE_HEIGHT = 120

function hexToRgba(hex: string, alpha: number): string {
  let normalized = hex.replace('#', '')
  if (normalized.length === 3) {
    normalized = normalized.split('').map((char) => char + char).join('')
  }
  if (normalized.length !== 6) {
    return `rgba(148, 163, 184, ${alpha})`
  }
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function emphasizeColor(color: string, alpha: number) {
  if (!color) return color
  if (color.startsWith('#')) {
    return hexToRgba(color, alpha)
  }
  return color
}

function getHandleColor(sourceNode: any, sourceHandle?: string | null): string | null {
  if (!sourceNode || !sourceHandle) return null

  const nodeType = sourceNode?.data?.type
  if (nodeType === 'path') {
    if (sourceHandle === 'else') return ELSE_HANDLE_COLOR
    const paths = Array.isArray(sourceNode.data?.config?.paths) ? sourceNode.data.config.paths : []
    const matchIndex = paths.findIndex((path: any) => path?.id === sourceHandle)
    if (matchIndex >= 0) {
      const match = paths[matchIndex]
      return match?.color || DEFAULT_PATH_COLORS[matchIndex % DEFAULT_PATH_COLORS.length]
    }
  }

  if (nodeType === 'ai_router') {
    const outputs = Array.isArray(sourceNode.data?.config?.outputPaths) ? sourceNode.data.config.outputPaths : []
    const matchIndex = outputs.findIndex((path: any) => path?.id === sourceHandle)
    if (matchIndex >= 0) {
      const match = outputs[matchIndex]
      return match?.color || DEFAULT_PATH_COLORS[matchIndex % DEFAULT_PATH_COLORS.length]
    }
  }

  return null
}

/**
 * Custom Flow Edge Component
 *
 * Style:
 * - Stroke: 1.5px, color #d0d6e0 (neutral grey)
 * - Path: Straight line from handle to handle
 * - Arrowhead: Small triangle on target
 * - Hover: Darker stroke (#9ca3af)
 * - Hit area: Widened for easier interaction
 * - Always-visible + button for inserting nodes (Zapier-style, hidden during reorder)
 */
export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  source,
  target,
  sourceHandle,
  data
}: EdgeProps) {
  const sourceNode = useStore(
    (state) => {
      const node = state.nodeInternals?.get(source)
      return node ? {
        id: node.id,
        position: node.position,
        positionAbsolute: node.positionAbsolute,
        width: node.width,
        height: node.height,
        data: node.data
      } : null
    }
  )
  const targetNode = useStore(
    (state) => {
      const node = state.nodeInternals?.get(target)
      return node ? {
        id: node.id,
        position: node.position,
        positionAbsolute: node.positionAbsolute,
        width: node.width,
        height: node.height,
        data: node.data
      } : null
    }
  )

  const correctedSource = { x: sourceX, y: sourceY }
  const correctedTarget = { x: targetX, y: targetY }

  // For vertical edges (Bottom → Top), compute coordinates from stored node positions
  const isVerticalEdge = sourcePosition === Position.Bottom && targetPosition === Position.Top

  if (isVerticalEdge) {
    const sourcePos = sourceNode?.positionAbsolute ?? sourceNode?.position
    const targetPos = targetNode?.positionAbsolute ?? targetNode?.position
    const nodeWidth = sourceNode?.width ?? targetNode?.width ?? DEFAULT_NODE_WIDTH
    const sourceHeight = sourceNode?.height ?? DEFAULT_NODE_HEIGHT

    if (sourcePos && targetPos) {
      const centerX = sourcePos.x + nodeWidth / 2
      correctedSource.x = centerX
      correctedTarget.x = centerX
      correctedSource.y = sourcePos.y + sourceHeight
      correctedTarget.y = targetPos.y
    }
  }

  const explicitColor = data?.edgeColor || style?.stroke
  const handleColor = explicitColor || getHandleColor(sourceNode, sourceHandle)
  const baseStroke = handleColor || '#d0d6e0'
  const strokeColor = selected ? emphasizeColor(baseStroke, 0.85) : baseStroke

  const edgePath = `M ${correctedSource.x},${correctedSource.y} L ${correctedTarget.x},${correctedTarget.y}`

  const buttonX = correctedSource.x + (correctedTarget.x - correctedSource.x) / 2
  const buttonY = correctedSource.y + (correctedTarget.y - correctedSource.y) / 2

  const isReordering = !!data?.isReordering

  const onEdgeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (data?.onInsertNode) {
      data.onInsertNode(id, { x: buttonX, y: buttonY })
    }
  }

  return (
    <>
      <g className="react-flow__edge">
        {/* Main visible path */}
        <path
          id={id}
          d={edgePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={markerEnd ? 'url(#react-flow__arrowclosed)' : undefined}
          style={{
            transition: 'stroke 120ms ease-out',
            ...style,
            stroke: strokeColor
          }}
        />
        {/* Invisible wider path for easier hover/selection */}
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={10}
          className="react-flow__edge-interaction"
          style={{ pointerEvents: 'all' }}
        />
      </g>

      {/* + button for inserting nodes - hidden during reorder drag */}
      {!isReordering && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${buttonX}px,${buttonY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <button
              onClick={onEdgeClick}
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
              aria-label="Add node"
            >
              <Plus className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

/**
 * Edge types mapping for ReactFlow
 */
export const flowEdgeTypes = {
  custom: FlowEdge,
  default: FlowEdge,
}

/**
 * Default edge options for ReactFlow
 */
export const defaultEdgeOptions = {
  type: 'custom',
  style: {
    strokeWidth: 1.5,
    stroke: '#d0d6e0',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  },
  animated: false,
  markerEnd: {
    type: 'arrowclosed' as const,
    width: 12,
    height: 12,
    color: '#d0d6e0',
  },
}
