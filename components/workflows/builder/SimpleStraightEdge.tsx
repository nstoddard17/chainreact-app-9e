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
  return (
    <g>
      <path
        d={`M ${sourceX} ${sourceY} L ${targetX} ${targetY}`}
        fill="none"
        stroke={style.stroke || '#d1d5db'}
        strokeWidth={style.strokeWidth || 1}
        strokeDasharray={style.strokeDasharray}
        markerEnd={markerEnd}
      />
    </g>
  )
}
