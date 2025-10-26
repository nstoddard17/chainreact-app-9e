import React from 'react'
import { EdgeProps, getSmoothStepPath } from '@xyflow/react'

/**
 * CustomEdgeWithButton - Simplified edge component
 * Note: The "add node" button feature has been removed.
 * Users now add nodes by dragging and connecting from node handles.
 */
export const CustomEdgeWithButton = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
}: EdgeProps) => {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16, // Match the rounded corners of nodes
  })

  return (
    <g>
      {/* Invisible thick path for easier clicking/selection */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={40}
        stroke="transparent"
        style={{ pointerEvents: 'stroke' }}
      />

      {/* Visible edge path */}
      <path
        id={id}
        style={style as React.CSSProperties}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        strokeWidth={2}
      />
    </g>
  )
}
