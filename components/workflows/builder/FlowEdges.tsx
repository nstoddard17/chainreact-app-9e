/**
 * FlowEdges.tsx
 *
 * Consistent edge styling for all workflows.
 * Features: 1.5px stroke, subtle color, straight lines, small arrowheads, + buttons.
 */

import React from 'react'
import { type EdgeProps, useStore, EdgeLabelRenderer, Position } from '@xyflow/react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

const ELSE_HANDLE_COLOR = '#64748B'
const DEFAULT_PATH_COLORS = ['#2563EB', '#EA580C', '#059669', '#9333EA', '#BE123C', '#14B8A6']
const DEFAULT_COLUMN_X = 400
const DEFAULT_NODE_WIDTH = 360
const DEFAULT_NODE_HEIGHT = 120
const DEFAULT_VERTICAL_SPACING = 180

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
 * - Always-visible + button for inserting nodes (Zapier-style)
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
  const sourceNode = useStore((state) => state.nodeInternals?.get(source) ?? null, (a, b) => a?.id === b?.id)
  const targetNode = useStore((state) => state.nodeInternals?.get(target) ?? null, (a, b) => a?.id === b?.id)

  const getNodeWidth = (node: any) => {
    if (!node) return DEFAULT_NODE_WIDTH
    const widths = [node.width, node.measured?.width, node.__rf?.width, (node.data as any)?.dimensions?.width]
    for (const value of widths) {
      const numeric = Number(value)
      if (Number.isFinite(numeric) && numeric > 0) return numeric
    }
    return DEFAULT_NODE_WIDTH
  }

  const getNodeHeight = (node: any) => {
    if (!node) return DEFAULT_NODE_HEIGHT

    // Try to get height from various React Flow node properties
    const heights = [
      node.height,
      node.measured?.height,
      node.__rf?.height,
      (node.data as any)?.dimensions?.height,
      node.computed?.height
    ]

    for (const value of heights) {
      const numeric = Number(value)
      if (Number.isFinite(numeric) && numeric > 0) return numeric
    }

    // Fallback: try to get from DOM if available
    if (typeof document !== 'undefined') {
      const domNode = document.querySelector(`[data-id="${node.id}"]`)
      if (domNode) {
        const rect = domNode.getBoundingClientRect()
        if (rect.height > 0) return rect.height
      }
    }

    return DEFAULT_NODE_HEIGHT
  }

  const getStoredPosition = (node: any) => node?.positionAbsolute ?? node?.position ?? null
  const correctedSource = { x: sourceX, y: sourceY }
  const correctedTarget = { x: targetX, y: targetY }
  const isVerticalEdge = sourcePosition === Position.Bottom && targetPosition === Position.Top

  if (isVerticalEdge) {
    const sourceBase = getStoredPosition(sourceNode)
    const targetBase = getStoredPosition(targetNode)
    const width = getNodeWidth(sourceNode ?? targetNode)
    const columnCenter = (sourceBase?.x ?? targetBase?.x ?? DEFAULT_COLUMN_X) + width / 2

    correctedSource.x = columnCenter
    correctedTarget.x = columnCenter

    // Calculate correct Y positions based on actual node positions and heights
    if (sourceBase && typeof sourceBase.y === 'number') {
      const sourceHeight = getNodeHeight(sourceNode)
      correctedSource.y = sourceBase.y + sourceHeight
    } else {
      correctedSource.y = sourceY
    }

    if (targetBase && typeof targetBase.y === 'number') {
      correctedTarget.y = targetBase.y
    } else {
      correctedTarget.y = targetY
    }
  }

  const explicitColor = data?.edgeColor || style?.stroke
  const handleColor = explicitColor || getHandleColor(sourceNode, sourceHandle)
  const baseStroke = handleColor || '#d0d6e0'
  const strokeColor = selected ? emphasizeColor(baseStroke, 0.85) : baseStroke

  // Use the actual corrected positions to connect directly from node to node
  // This ensures the edge connects properly from trigger to action placeholders
  const edgePath = `M ${correctedSource.x},${correctedSource.y} L ${correctedTarget.x},${correctedTarget.y}`

  // Calculate midpoint for + button positioning
  const labelX = (correctedSource.x + correctedTarget.x) / 2
  const labelY = (correctedSource.y + correctedTarget.y) / 2

  const onEdgeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (data?.onInsertNode) {
      data.onInsertNode(id, { x: labelX, y: labelY })
    }
  }

  // Render the edge path directly without BaseEdge to avoid any modifications
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

      {/* Always-visible + button for inserting nodes */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
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
