import { EdgeProps } from '@xyflow/react'

export function SimpleStraightEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
}: EdgeProps) {
  // For vertical alignment, use the source X position for both points
  return (
    <g>
      <path
        d={`M ${sourceX} ${sourceY} L ${sourceX} ${targetY}`}
        fill="none"
        stroke={style.stroke || '#d1d5db'}
        strokeWidth={style.strokeWidth || 1}
        strokeDasharray={style.strokeDasharray}
        markerEnd={markerEnd}
      />
    </g>
  )
}
