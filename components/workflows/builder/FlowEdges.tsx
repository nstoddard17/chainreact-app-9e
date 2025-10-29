/**
 * FlowEdges.tsx
 *
 * Consistent edge styling for all workflows.
 * Features: 1.5px stroke, subtle color, smooth curves, small arrowheads.
 */

import React from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

/**
 * Custom Flow Edge Component
 *
 * Style:
 * - Stroke: 1.5px, color #d0d6e0 (neutral grey)
 * - Path: Smooth bezier curve (slight S-curve)
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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? '#9ca3af' : '#d0d6e0',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
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
      />
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
