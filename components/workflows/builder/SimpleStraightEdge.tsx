import { EdgeProps, getSmoothStepPath, getStraightPath } from '@xyflow/react'

const shouldUseStraightEdge = (sourceX: number, sourceY: number, targetX: number, targetY: number) => {
  const verticalGap = Math.abs(sourceY - targetY)
  const horizontalDelta = targetX - sourceX
  return verticalGap <= 60 && horizontalDelta >= -40
}

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
  const [edgePath] = shouldUseStraightEdge(sourceX, sourceY, targetX, targetY)
    ? getStraightPath({
        sourceX,
        sourceY,
        targetX,
        targetY
      })
    : getSmoothStepPath({
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
