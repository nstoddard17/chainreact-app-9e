import React, { useState } from 'react'
import { EdgeProps, getBezierPath } from '@xyflow/react'
import { Plus } from 'lucide-react'

export const RoundedEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data
}: EdgeProps) => {
  // Use getBezierPath for smooth curves
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25, // Adjust curvature for smoother curves
  })

  const [isHovered, setIsHovered] = useState(false)

  // Handle adding node between source and target
  const onAddNode = data?.onAddNode

  return (
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: onAddNode ? 'pointer' : 'default' }}
    >
      {/* Invisible wider path for better hover detection */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        style={{ pointerEvents: 'stroke' }}
      />

      {/* Main edge path */}
      <path
        id={id}
        style={style as React.CSSProperties}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        strokeWidth={style.strokeWidth || 2}
        stroke={style.stroke || '#9ca3af'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Add button in the middle of the edge */}
      {(typeof onAddNode === 'function' && (isHovered || data?.alwaysShowButton)) ? (
        <foreignObject
          width={30}
          height={30}
          x={labelX - 15}
          y={labelY - 15}
          style={{ overflow: 'visible', pointerEvents: 'all' }}
        >
          <div
            className="flex items-center justify-center"
            style={{ width: '30px', height: '30px' }}
          >
            <button
              className="w-7 h-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center shadow-md transition-all hover:scale-110"
              onClick={(e) => {
                e.stopPropagation()
                if (typeof onAddNode === 'function') {
                  onAddNode()
                }
              }}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </foreignObject>
      ) : null}
    </g>
  )
}