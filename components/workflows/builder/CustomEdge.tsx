"use client"

import React from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LAYOUT, getCanvasDimensions } from './layout'

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
  source,
  target,
}: EdgeProps) {
  // Match the visible gap between nodes so the line never overlaps either card.
  const { nodeGapX } = getCanvasDimensions()
  const layoutGap = Number.isFinite(nodeGapX) && nodeGapX > 0 ? nodeGapX : LAYOUT.nodeGapX
  const availableGap = Math.abs(targetX - sourceX)
  const desiredEdgeLength = availableGap > 0 ? Math.min(layoutGap, availableGap) : layoutGap

  // Collect DOM measurements to help debug positional offsets.
  let sourceRect: DOMRect | null = null
  let targetRect: DOMRect | null = null

  if (typeof document !== 'undefined') {
    const sourceNode = source ? document.querySelector(`[data-id="${source}"]`) : null
    const targetNode = target ? document.querySelector(`[data-id="${target}"]`) : null
    sourceRect = sourceNode instanceof HTMLElement ? sourceNode.getBoundingClientRect() : null
    targetRect = targetNode instanceof HTMLElement ? targetNode.getBoundingClientRect() : null
  }

  const debugPayload = {
    edgeId: id,
    sourceId: source,
    targetId: target,
    sourceX,
    targetX,
    availableGap,
    desiredEdgeLength,
    layoutGap,
    nodeGapToken: nodeGapX,
    sourceRect: sourceRect
      ? {
          left: sourceRect.left,
          top: sourceRect.top,
          width: sourceRect.width,
          height: sourceRect.height,
        }
      : null,
    targetRect: targetRect
      ? {
          left: targetRect.left,
          top: targetRect.top,
          width: targetRect.width,
          height: targetRect.height,
        }
      : null,
  }

  if (process.env.NODE_ENV !== 'production') {
    // Log as JSON so everything is expanded by default for easy copy/paste.
    console.log('[CustomEdge:length-debug]\n', JSON.stringify(debugPayload, null, 2))
  }

  // Calculate the midpoint between source and target
  const midX = (sourceX + targetX) / 2
  const midY = (sourceY + targetY) / 2

  // Create a short edge centered at the midpoint
  const adjustedSourceX = midX - (desiredEdgeLength / 2)
  const adjustedTargetX = midX + (desiredEdgeLength / 2)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: adjustedSourceX,
    sourceY: midY,
    sourcePosition,
    targetX: adjustedTargetX,
    targetY: midY,
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
