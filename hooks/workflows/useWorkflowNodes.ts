/**
 * useWorkflowNodes
 *
 * Manages React Flow nodes and edges state with custom sanitization logic.
 * Handles AddAction node onClick handlers and node title normalization.
 *
 * Key features:
 * - Custom setNodes that preserves AddAction onClick handlers
 * - Node sanitization (drops malformed, fixes missing titles)
 * - Optimized node changes for parent-child movement
 * - Stable node/edge types to prevent re-renders
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import { useNodesState, useEdgesState, useReactFlow, type Node, type Edge } from '@xyflow/react'
import CustomNode from '@/components/workflows/CustomNode'
import { AddActionNode } from '@/components/workflows/AddActionNode'
import { ChainPlaceholderNode } from '@/components/workflows/ChainPlaceholderNode'
import InsertActionNode from '@/components/workflows/InsertActionNode'
import { FlowEdge } from '@/components/workflows/builder/FlowEdges'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { logger } from '@/lib/utils/logger'

export function useWorkflowNodes() {
  // Store onClick handlers for AddActionNodes
  const addActionHandlersRef = useRef<Record<string, () => void>>({})

  // React Flow state
  const [nodes, setNodesInternal, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { fitView, getNodes, getEdges } = useReactFlow()

  // Edge selection state for deletion
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  /**
   * Custom setNodes that preserves onClick handlers for AddActionNodes
   * and sanitizes node data (drops malformed, fixes missing titles)
   */
  const setNodes = useCallback((updater: Node[] | ((nodes: Node[]) => Node[])) => {
    setNodesInternal(currentNodes => {
      const incoming = typeof updater === 'function' ? updater(currentNodes) : updater

      // Sanitize nodes: drop malformed, fix missing titles, and restore AddAction handlers
      const sanitized: Node[] = []
      for (const node of incoming) {
        // Always allow UI addAction nodes
        if (node.type === 'addAction') {
          const withHandler = addActionHandlersRef.current[node.id]
            ? { ...node, data: { ...(node.data || {}), onClick: addActionHandlersRef.current[node.id] } }
            : node
          sanitized.push(withHandler)
          continue
        }

        // Allow insertAction and chainPlaceholder nodes
        if (node.type === 'insertAction' || node.type === 'chainPlaceholder') {
          sanitized.push(node)
          continue
        }

        const nodeType = (node as any)?.data?.type
        const isTrigger = Boolean((node as any)?.data?.isTrigger)
        if (!nodeType && !isTrigger) {
          logger.warn('[WorkflowNodes] Dropping malformed node without data.type', { id: node.id, type: node.type })
          continue
        }

        // Ensure a stable, human-readable title
        const existingTitle = (node as any)?.data?.title
        if (!existingTitle || (typeof existingTitle === 'string' && existingTitle.trim().length === 0) || existingTitle === 'Unnamed Action') {
          const component = ALL_NODE_COMPONENTS.find(c => c.type === nodeType)
          const safeTitle = component?.title || nodeType || (isTrigger ? 'Trigger' : 'Action')
          sanitized.push({
            ...node,
            data: { ...(node.data as any), title: safeTitle }
          })
        } else {
          sanitized.push(node)
        }
      }

      return sanitized
    })
  }, [setNodesInternal])

  /**
   * Optimized node change handler for parent-child movement
   * Ensures AddAction nodes move with their parent nodes
   */
  const optimizedOnNodesChange = useCallback((changes: any) => {
    // Handle parent-child movement for add action nodes
    const positionChanges = changes.filter((change: any) => change.type === 'position')

    if (positionChanges.length > 0) {
      // Find add action nodes that need to move with their parent
      const additionalChanges: any[] = []
      const currentNodes = getNodes()

      // Check if any node has finished being dragged (dragging === false)
      const hasFinishedDragging = positionChanges.some((change: any) => change.dragging === false)

      positionChanges.forEach((change: any) => {
        if (change.dragging !== false && !change.id.startsWith('add-action-')) {
          // This is a parent node being dragged, find its add action node
          const addActionId = `add-action-${change.id}`
          const addActionNode = currentNodes.find(n => n.id === addActionId)

          if (addActionNode && change.position) {
            // Create a position change for the add action node
            additionalChanges.push({
              id: addActionId,
              type: 'position',
              position: {
                x: change.position.x,
                y: change.position.y + 120 // Position below parent
              },
              dragging: change.dragging
            })
          }
        }
      })

      // Apply all changes together
      if (additionalChanges.length > 0) {
        onNodesChange([...changes, ...additionalChanges])
        return
      }

      // If dragging finished, save the changes
      if (hasFinishedDragging) {
        onNodesChange(changes)
        return
      }
    }

    // Default behavior for all other changes
    onNodesChange(changes)
  }, [getNodes, onNodesChange])

  /**
   * Memoized node types - prevents re-creation on every render
   */
  const nodeTypes = useMemo(() => ({
    custom: CustomNode,
    addAction: AddActionNode,
    insertAction: InsertActionNode as any,
    chainPlaceholder: ChainPlaceholderNode,
  }), [])

  /**
   * Memoized edge types - prevents re-creation on every render
   */
  const edgeTypes = useMemo(() => ({
    custom: FlowEdge,
    straight: FlowEdge,
    rounded: FlowEdge,
  }), [])

  return {
    // State
    nodes,
    edges,
    selectedEdgeId,
    setSelectedEdgeId,

    // Setters
    setNodes,
    setEdges,

    // Change handlers
    onNodesChange,
    optimizedOnNodesChange,
    onEdgesChange,

    // React Flow utilities
    fitView,
    getNodes,
    getEdges,

    // Types
    nodeTypes,
    edgeTypes,

    // Refs
    addActionHandlersRef,
  }
}
