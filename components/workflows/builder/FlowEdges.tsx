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

const DEFAULT_COLUMN_X = 400

  const getNodeWidth = (node: any) => {
    if (!node) return 360
    const widths = [node.width, node.measured?.width, node.__rf?.width, (node.data as any)?.dimensions?.width]
    for (const value of widths) {
      const numeric = Number(value)
      if (Number.isFinite(numeric) && numeric > 0) return numeric
    }
    const type = (node.data as any)?.type
    if (type === 'trigger_placeholder' || type === 'action_placeholder') return 360
    return 360
  }

  const getStoredPosition = (node: any) => node?.position ?? node?.positionAbsolute ?? null
  const correctedSource = { x: sourceX, y: sourceY }
  const correctedTarget = { x: targetX, y: targetY }
  const isVerticalEdge = sourcePosition === Position.Bottom && targetPosition === Position.Top

  if (isVerticalEdge) {
    const sourceBase = getStoredPosition(sourceNode)
    const targetBase = getStoredPosition(targetNode)

    if (sourceBase) {
      const fallbackX = (typeof sourceBase.x === 'number' ? sourceBase.x : DEFAULT_COLUMN_X)
      correctedSource.x = fallbackX + getNodeWidth(sourceNode) / 2
    }

    if (targetBase) {
      const fallbackX = (typeof targetBase.x === 'number' ? targetBase.x : DEFAULT_COLUMN_X)
      correctedTarget.x = fallbackX + getNodeWidth(targetNode) / 2
    }

    if (!sourceBase && !targetBase) {
      const fallbackCenter = DEFAULT_COLUMN_X + getNodeWidth(sourceNode ?? targetNode) / 2
      correctedSource.x = fallbackCenter
      correctedTarget.x = fallbackCenter
    } else if (!sourceBase && targetBase) {
      correctedSource.x = correctedTarget.x
    } else if (!targetBase && sourceBase) {
      correctedTarget.x = correctedSource.x
    }
  }

  const explicitColor = data?.edgeColor || style?.stroke
  const handleColor = explicitColor || getHandleColor(sourceNode, sourceHandle)
  const baseStroke = handleColor || '#d0d6e0'
  const strokeColor = selected ? emphasizeColor(baseStroke, 0.85) : baseStroke

  // Create a simple horizontal line directly from source to target
  // This ensures the line goes straight from half-moon to half-moon
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
