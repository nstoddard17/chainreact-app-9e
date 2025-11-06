"use client"

import React, { useMemo } from 'react'
import { useReactFlow } from '@xyflow/react'
import { PathLabelPill } from '../PathLabelPill'

interface PathLabelsOverlayProps {
  collapsedPaths: Set<string>
  pathLabels: Record<string, string>
  onToggleCollapse: (pathId: string) => void
  onRename: (pathId: string) => void
  onDuplicate: (pathId: string) => void
  onCopy: (pathId: string) => void
  onAddNote: (pathId: string) => void
  onDelete: (pathId: string) => void
}

export function PathLabelsOverlay({
  collapsedPaths,
  pathLabels,
  onToggleCollapse,
  onRename,
  onDuplicate,
  onCopy,
  onAddNote,
  onDelete,
}: PathLabelsOverlayProps) {
  const { getNodes, getEdges } = useReactFlow()

  // Calculate path label positions
  const pathLabelData = useMemo(() => {
    const nodes = getNodes()
    const edges = getEdges()

    // Find all Path Router nodes
    const routerNodes = nodes.filter((node: any) => node.data?.type === 'path')

    const labels: Array<{
      pathId: string
      label: string
      position: { x: number; y: number }
      isCollapsed: boolean
    }> = []

    routerNodes.forEach((routerNode: any) => {
      // Find edges going out of this router
      const outgoingEdges = edges.filter((edge: any) => edge.source === routerNode.id)

      outgoingEdges.forEach((edge: any) => {
        // Find the target node
        const targetNode = nodes.find((n: any) => n.id === edge.target)

        if (targetNode && targetNode.data?.type === 'path_condition') {
          const pathId = edge.id

          // Calculate midpoint between router and path condition node
          const labelX = (routerNode.position.x + targetNode.position.x) / 2 + 225 // 225 = half node width
          const labelY = (routerNode.position.y + targetNode.position.y) / 2

          // Get path name from path condition node or default
          const pathName = targetNode.data?.config?.pathName || pathLabels[pathId] || 'Path'

          labels.push({
            pathId,
            label: pathName,
            position: { x: labelX, y: labelY },
            isCollapsed: collapsedPaths.has(pathId),
          })
        }
      })
    })

    return labels
  }, [getNodes, getEdges, pathLabels, collapsedPaths])

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1000 }}>
      {pathLabelData.map((data) => (
        <PathLabelPill
          key={data.pathId}
          pathId={data.pathId}
          label={data.label}
          position={data.position}
          isCollapsed={data.isCollapsed}
          onToggleCollapse={() => onToggleCollapse(data.pathId)}
          onRename={() => onRename(data.pathId)}
          onDuplicate={() => onDuplicate(data.pathId)}
          onCopy={() => onCopy(data.pathId)}
          onAddNote={() => onAddNote(data.pathId)}
          onDelete={() => onDelete(data.pathId)}
        />
      ))}
    </div>
  )
}
