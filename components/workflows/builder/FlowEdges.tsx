/**
 * FlowEdges.tsx
 *
 * Consistent edge styling for all workflows.
 * Features: 1.5px stroke, subtle color, straight lines, small arrowheads.
 */

import React from 'react'
import { type EdgeProps } from '@xyflow/react'

/**
 * Custom Flow Edge Component
 *
 * Style:
 * - Stroke: 1.5px, color #d0d6e0 (neutral grey)
 * - Path: Straight line from handle to handle
 * - Arrowhead: Small triangle on target
 * - Hover: Darker stroke (#9ca3af)
 * - Hit area: Widened for easier interaction
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
}: EdgeProps) {
  // Create a simple horizontal line directly from source to target
  // This ensures the line goes straight from half-moon to half-moon
  const edgePath = `M ${sourceX},${sourceY} L ${targetX},${targetY}`

  console.log('[FlowEdge] Rendering STRAIGHT edge:', { id, sourceX, sourceY, targetX, targetY, path: edgePath })

  // Render the edge path directly without BaseEdge to avoid any modifications
  return (
    <g className="react-flow__edge">
      {/* Main visible path */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={selected ? '#9ca3af' : '#d0d6e0'}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={markerEnd ? 'url(#react-flow__arrowclosed)' : undefined}
        style={{
          transition: 'stroke 120ms ease-out',
          ...style,
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
