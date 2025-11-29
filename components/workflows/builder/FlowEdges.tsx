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
import { LAYOUT, getCanvasDimensions } from './layout'

const ELSE_HANDLE_COLOR = '#64748B'
const DEFAULT_PATH_COLORS = ['#2563EB', '#EA580C', '#059669', '#9333EA', '#BE123C', '#14B8A6']
const DEFAULT_COLUMN_X = 400
const DEFAULT_NODE_WIDTH = 360
const DEFAULT_NODE_HEIGHT = 120
const HANDLE_OFFSET = 9 // half of the 18px handle height in CustomNode
function getNodeRectFromDom(nodeId?: string) {
  if (typeof document === 'undefined' || !nodeId) return null
  const element = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${nodeId}"]`)
  return element?.getBoundingClientRect() ?? null
}

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
  // Use a more aggressive selector that forces re-render on position changes
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

  const getNodeWidth = (node: any, rect?: DOMRect | null) => {
    if (!node) return DEFAULT_NODE_WIDTH
    const widths = [
      node.width,
      node.measured?.width,
      node.__rf?.width,
      (node.data as any)?.dimensions?.width,
      node.computed?.width,
      rect?.width,
    ]
    for (const value of widths) {
      const numeric = Number(value)
      if (Number.isFinite(numeric) && numeric > 0) return numeric
    }
    return DEFAULT_NODE_WIDTH
  }

  const getNodeHeight = (node: any, rect?: DOMRect | null) => {
    if (!node) return DEFAULT_NODE_HEIGHT

    const heights = [
      node.height,
      node.measured?.height,
      node.__rf?.height,
      (node.data as any)?.dimensions?.height,
      node.computed?.height,
      rect?.height,
    ]

    for (const value of heights) {
      const numeric = Number(value)
      if (Number.isFinite(numeric) && numeric > 0) return numeric
    }

    return DEFAULT_NODE_HEIGHT
  }

  const sourceRect = getNodeRectFromDom(source)
  const targetRect = getNodeRectFromDom(target)

  // Get stored position with fallback chain to ensure we always have coordinates
  const getStoredPosition = (node: any) => {
    // Try positionAbsolute first (most accurate during animations)
    if (node?.positionAbsolute && typeof node.positionAbsolute.x === 'number' && typeof node.positionAbsolute.y === 'number') {
      return node.positionAbsolute
    }
    // Fall back to position if positionAbsolute is not available
    if (node?.position && typeof node.position.x === 'number' && typeof node.position.y === 'number') {
      return node.position
    }
    return null
  }

  const correctedSource = { x: sourceX, y: sourceY }
  const correctedTarget = { x: targetX, y: targetY }

  // Check if this is a vertical edge (source bottom to target top)
  // Also consider it vertical if positions are undefined (React Flow hasn't initialized yet)
  // or if source is above target (typical workflow layout)
  const isVerticalEdge = sourcePosition === Position.Bottom && targetPosition === Position.Top
  const likelyVertical = isVerticalEdge ||
    (sourcePosition === undefined && targetPosition === undefined) ||
    (sourceY < targetY && Math.abs(sourceX - targetX) < 100) // Source above target, roughly aligned

  let desiredVerticalLength = 0
  let availableVerticalGap = 0

  if (isVerticalEdge || likelyVertical) {
    const sourceBase = getStoredPosition(sourceNode)
    const targetBase = getStoredPosition(targetNode)
    const width = getNodeWidth(sourceNode ?? targetNode, sourceRect ?? targetRect)
    const { nodeGapY } = getCanvasDimensions()
    const fallbackGap = Number.isFinite(nodeGapY) && nodeGapY > 0 ? nodeGapY : LAYOUT.nodeGapY
    const fallbackCenter =
      Number.isFinite(sourceX)
        ? sourceX
        : Number.isFinite(targetX)
          ? targetX
          : DEFAULT_COLUMN_X + width / 2

    const columnCenter =
      sourceBase && typeof sourceBase.x === 'number'
        ? sourceBase.x + width / 2
        : targetBase && typeof targetBase.x === 'number'
          ? targetBase.x + width / 2
          : fallbackCenter

    correctedSource.x = columnCenter
    correctedTarget.x = columnCenter

    const sourceHeight = getNodeHeight(sourceNode, sourceRect)

    // Always prefer stored positions over the React Flow provided coordinates
    // This ensures edges stay connected even during position updates
    const sourceAnchor =
      sourceBase && typeof sourceBase.y === 'number'
        ? sourceBase.y + sourceHeight
        : Number.isFinite(sourceY)
          ? sourceY + HANDLE_OFFSET
          : null

    const targetAnchor =
      targetBase && typeof targetBase.y === 'number'
        ? targetBase.y
        : Number.isFinite(targetY)
          ? targetY - HANDLE_OFFSET
          : null

    const fallbackSourceY = Number.isFinite(sourceY) ? sourceY + HANDLE_OFFSET : null
    const fallbackTargetY = Number.isFinite(targetY) ? targetY - HANDLE_OFFSET : null

    let anchorSourceY = Number.isFinite(sourceAnchor) ? Number(sourceAnchor) : null
    let anchorTargetY = Number.isFinite(targetAnchor) ? Number(targetAnchor) : null

    // If we only have one anchor, project the other using the standard gap so the line still renders
    if (!Number.isFinite(anchorSourceY) && Number.isFinite(anchorTargetY)) {
      anchorSourceY = anchorTargetY! - fallbackGap
    } else if (!Number.isFinite(anchorTargetY) && Number.isFinite(anchorSourceY)) {
      anchorTargetY = anchorSourceY! + fallbackGap
    }

    if (!Number.isFinite(anchorSourceY)) {
      anchorSourceY = Number.isFinite(fallbackSourceY) ? Number(fallbackSourceY) : Number.isFinite(sourceY) ? sourceY : 0
    }
    if (!Number.isFinite(anchorTargetY)) {
      anchorTargetY = Number.isFinite(fallbackTargetY)
        ? Number(fallbackTargetY)
        : (Number.isFinite(anchorSourceY) ? anchorSourceY! + fallbackGap : fallbackGap)
    }

    let actualGap = (anchorTargetY ?? 0) - (anchorSourceY ?? 0)

    if (!Number.isFinite(actualGap) || actualGap <= 0) {
      anchorTargetY = (anchorSourceY ?? 0) + fallbackGap
      actualGap = fallbackGap
    }

    correctedSource.y = anchorSourceY ?? correctedSource.y
    correctedTarget.y = anchorTargetY ?? correctedTarget.y
    desiredVerticalLength = actualGap
    availableVerticalGap = actualGap
  }

  const explicitColor = data?.edgeColor || style?.stroke
  const handleColor = explicitColor || getHandleColor(sourceNode, sourceHandle)
  const baseStroke = handleColor || '#d0d6e0'
  const strokeColor = selected ? emphasizeColor(baseStroke, 0.85) : baseStroke

  // Connect directly from node to node (bottom of source to top of target)
  const edgePath = `M ${correctedSource.x},${correctedSource.y} L ${correctedTarget.x},${correctedTarget.y}`

  const edgeVectorX = correctedTarget.x - correctedSource.x
  const edgeVectorY = correctedTarget.y - correctedSource.y
  const edgeLength = Math.sqrt(edgeVectorX ** 2 + edgeVectorY ** 2)

  // Base midpoint (used for labels/debug)
  const midLabelX = correctedSource.x + edgeVectorX / 2
  const midLabelY = correctedSource.y + edgeVectorY / 2

  // Place the + button at the midpoint of the line
  const buttonX = midLabelX
  const buttonY = midLabelY

  if (process.env.NODE_ENV !== 'production') {
    const length = Math.sqrt(
      (correctedTarget.x - correctedSource.x) ** 2 +
      (correctedTarget.y - correctedSource.y) ** 2
    )
    const debugPayload = {
      edgeId: id,
      sourceId: source,
      targetId: target,
      sourceHandle,
      positions: {
        original: { sourceX, sourceY, targetX, targetY },
        corrected: { source: correctedSource, target: correctedTarget },
        label: { x: midLabelX, y: midLabelY },
        button: { x: buttonX, y: buttonY },
      },
      isVerticalEdge,
      strokeColor: strokeColor || null,
      length,
      desiredVerticalLength: isVerticalEdge ? desiredVerticalLength : undefined,
      availableVerticalGap: isVerticalEdge ? availableVerticalGap : undefined,
      sourceRect: sourceRect
        ? {
            left: sourceRect.left,
            top: sourceRect.top,
            width: sourceRect.width,
            height: sourceRect.height,
          }
        : null,
      targetRect: targetRect
        ? {
            left: targetRect.left,
            top: targetRect.top,
            width: targetRect.width,
            height: targetRect.height,
          }
        : null,
    }

    // console.log('[FlowEdge:length-debug]\n', JSON.stringify(debugPayload, null, 2))
  }

  const onEdgeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (data?.onInsertNode) {
      data.onInsertNode(id, { x: buttonX, y: buttonY })
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
