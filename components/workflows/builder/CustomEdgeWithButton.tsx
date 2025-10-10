import React, { useState } from 'react'
import { EdgeProps, getSmoothStepPath } from '@xyflow/react'
import { Plus } from 'lucide-react'

export const CustomEdgeWithButton = ({
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
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16, // Match the rounded corners of nodes
  })
  
  const [isHovered, setIsHovered] = useState(false)
  
  // Handle adding node between source and target
  // Note: onAddNode might not be available for programmatically created edges
  const onAddNode = data?.onAddNode
  
  return (
    <g 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: onAddNode ? 'pointer' : 'default' }}
    >
      <path
        d={edgePath}
        fill="none"
        strokeWidth={40}
        stroke="transparent"
        style={{ pointerEvents: 'stroke' }}
      />
      
      <path
        id={id}
        style={style as React.CSSProperties}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        strokeWidth={2}
      />
      
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
                console.log('Plus button clicked on edge:', id)
                console.log('onAddNode function available:', typeof onAddNode)
                console.log('Edge data:', data)
                
                if (typeof onAddNode === 'function') {
                  console.log('Calling onAddNode...')
                  // The onAddNode callback already has the source and target IDs closed over
                  // Just call it directly - it will handle everything
                  onAddNode()
                } else {
                  console.error('onAddNode is not a function:', onAddNode)
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