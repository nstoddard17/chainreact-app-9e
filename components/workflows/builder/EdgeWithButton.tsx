"use client"

import React from 'react'
import { BaseEdge, EdgeProps, getStraightPath } from '@xyflow/react'
import { Plus } from 'lucide-react'

/**
 * EdgeWithButton - Custom edge with a plus button in the middle
 *
 * Used between nodes and after the last node.
 * Plus button opens integrations panel to add a new node.
 */
export function EdgeWithButton({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}: EdgeProps) {
  const [edgePath] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  // Calculate the midpoint of the edge
  const midX = (sourceX + targetX) / 2
  const midY = (sourceY + targetY) / 2

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (data?.onAddNode) {
      data.onAddNode(data.afterNodeId)
    }
  }

  return (
    <>
      {/* The dashed edge line */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeDasharray: '5,5',
          stroke: 'rgb(156 163 175)', // gray-400
          strokeWidth: 2,
        }}
      />

      {/* Plus button in the middle of the edge */}
      <foreignObject
        x={midX - 16}
        y={midY - 16}
        width={32}
        height={32}
        style={{ overflow: 'visible' }}
      >
        <button
          onClick={handleClick}
          className="group flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer"
          style={{ pointerEvents: 'auto' }}
        >
          <Plus className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
        </button>
      </foreignObject>
    </>
  )
}
