"use client"

import React from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const onEdgeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (data?.onInsertNode) {
      data.onInsertNode(id, { x: labelX, y: labelY })
    }
  }

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 12,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full h-6 w-6 p-0 bg-background hover:bg-primary/10 border-2 border-dashed border-muted-foreground/30 hover:border-primary transition-all shadow-sm"
            onClick={onEdgeClick}
          >
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
