import { EdgeProps, getSmoothStepPath } from '@xyflow/react'

export function SimpleStraightEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  // Use smooth step path for rounded corners
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
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        stroke={style.stroke || '#9ca3af'}
        strokeWidth={style.strokeWidth || 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={style.strokeDasharray}
        markerEnd={markerEnd}
      />
    </g>
  )
}
