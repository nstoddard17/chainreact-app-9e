/**
 * layout.ts
 *
 * Layout constants and canvas camera helpers for Flow V2 Builder
 * Used by the animated build UX to control viewport and node positioning
 */

import type { ReactFlowInstance, Node, Edge } from '@xyflow/react'
import dagre from 'dagre'

/**
 * Layout constants - matches values in tokens.css
 */
export const LAYOUT = {
  nodeWidth: 300,
  nodeGapX: 160,
  nodeGapY: 96,
  canvasPadding: 64, // fitView padding in px
  cameraMargin: 120, // margin around target node when panning
  cameraDuration: 500, // ms
  cameraZoom: 0.9, // default zoom level when focusing on node
  skeletonZoom: 0.85, // zoom level when showing full skeleton
} as const

/**
 * Camera easing function (back-out)
 */
const CAMERA_EASING = [0.22, 1, 0.36, 1] as const

/**
 * Fit the entire flow into view with padding
 * Uses skeleton zoom level (~0.85) to show full flow
 */
export function fitCanvasToFlow(instance: ReactFlowInstance, options: { skeleton?: boolean } = {}) {
  if (!instance) return

  const { skeleton = false } = options

  instance.fitView({
    padding: 0.15, // 15% padding around edges
    includeHiddenNodes: true,
    minZoom: 0.5,
    maxZoom: skeleton ? LAYOUT.skeletonZoom : 1.5,
    duration: LAYOUT.cameraDuration,
  })
}

/**
 * Pan and zoom to focus on a specific node
 */
export function panToNode(
  instance: ReactFlowInstance,
  nodeId: string,
  options: {
    duration?: number
    zoom?: number
    margin?: number
  } = {}
) {
  if (!instance) return

  const node = instance.getNode(nodeId)
  if (!node) return

  const {
    duration = LAYOUT.cameraDuration,
    zoom = LAYOUT.cameraZoom,
    margin = LAYOUT.cameraMargin,
  } = options

  // Calculate center position with margin
  const x = node.position.x + (node.width ?? LAYOUT.nodeWidth) / 2
  const y = node.position.y + (node.height ?? 100) / 2

  instance.setCenter(x, y, {
    zoom,
    duration,
  })
}

/**
 * Toggle grey filter on a node
 * Used during animated build to show which nodes are pending
 */
export function setNodeGrey(
  instance: ReactFlowInstance,
  nodeId: string,
  grey: boolean = true
) {
  if (!instance) return

  const nodes = instance.getNodes()
  const updatedNodes = nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        className: grey
          ? 'node-grey'
          : node.className?.replace('node-grey', '').trim() || '',
      }
    }
    return node
  })

  instance.setNodes(updatedNodes)
}

/**
 * Set active state on a node (blue outline)
 * Used to highlight the currently configuring node
 */
export function setNodeActive(
  instance: ReactFlowInstance,
  nodeId: string | null
) {
  if (!instance) return

  const nodes = instance.getNodes()
  const updatedNodes = nodes.map((node) => {
    const wasActive = node.className?.includes('node-active')
    const shouldBeActive = node.id === nodeId

    if (wasActive === shouldBeActive) return node

    let className = node.className || ''

    if (shouldBeActive) {
      className = `${className} node-active`.trim()
    } else {
      className = className.replace('node-active', '').trim()
    }

    return {
      ...node,
      className,
    }
  })

  instance.setNodes(updatedNodes)
}

/**
 * Mark node as done (remove grey, remove active, keep normal styling)
 */
export function setNodeDone(
  instance: ReactFlowInstance,
  nodeId: string
) {
  if (!instance) return

  const nodes = instance.getNodes()
  const updatedNodes = nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        className: 'node-done',
      }
    }
    return node
  })

  instance.setNodes(updatedNodes)
}

/**
 * Apply grey state to all nodes (used during skeleton build)
 */
export function setAllNodesGrey(instance: ReactFlowInstance) {
  if (!instance) return

  const nodes = instance.getNodes()
  const updatedNodes = nodes.map((node) => ({
    ...node,
    className: 'node-grey',
  }))

  instance.setNodes(updatedNodes)
}

/**
 * Get canvas dimensions from CSS variables
 */
export function getCanvasDimensions() {
  if (typeof window === 'undefined') {
    return {
      nodeWidth: LAYOUT.nodeWidth,
      nodeGapX: LAYOUT.nodeGapX,
      nodeGapY: LAYOUT.nodeGapY,
    }
  }

  const style = getComputedStyle(document.documentElement)

  return {
    nodeWidth: parseInt(style.getPropertyValue('--node-width') || String(LAYOUT.nodeWidth)),
    nodeGapX: parseInt(style.getPropertyValue('--node-gap-x') || String(LAYOUT.nodeGapX)),
    nodeGapY: parseInt(style.getPropertyValue('--node-gap-y') || String(LAYOUT.nodeGapY)),
  }
}

/**
 * Auto-layout nodes using dagre (left-to-right)
 * Only used for initial skeleton - doesn't reflow after user moves nodes
 */
export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  options: {
    direction?: 'LR' | 'TB'
    nodeWidth?: number
    nodeHeight?: number
  } = {}
): Node[] {
  const {
    direction = 'LR',
    nodeWidth = LAYOUT.nodeWidth,
    nodeHeight = 100,
  } = options

  const dims = getCanvasDimensions()

  // Create dagre graph
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))

  // Configure graph
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: dims.nodeGapX,
    ranksep: dims.nodeGapY,
  })

  // Add nodes to graph
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: node.width ?? nodeWidth,
      height: node.height ?? nodeHeight,
    })
  })

  // Add edges to graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  // Compute layout
  dagre.layout(dagreGraph)

  // Apply positions to nodes
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)

    return {
      ...node,
      position: {
        // Dagre returns center position, adjust to top-left
        x: nodeWithPosition.x - (node.width ?? nodeWidth) / 2,
        y: nodeWithPosition.y - (node.height ?? nodeHeight) / 2,
      },
    }
  })
}

/**
 * Check if nodes need layout (any node has no position)
 */
export function needsLayout(nodes: Node[]): boolean {
  return nodes.some((node) => !node.position || (node.position.x === 0 && node.position.y === 0))
}

/**
 * Calculate horizontal layout starting from agent panel edge
 * Places nodes in a horizontal row to the right of the 1120px agent panel
 */
export function calculateHorizontalLayout(
  nodes: Node[],
  options: {
    agentPanelWidth?: number
    startOffset?: number
    verticalCenter?: number
  } = {}
): Node[] {
  const {
    agentPanelWidth = 1120,
    startOffset = 80, // Space between panel and first node
    verticalCenter = 200, // Y position for all nodes
  } = options

  const dims = getCanvasDimensions()
  const startX = agentPanelWidth + startOffset

  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: startX + (index * (dims.nodeWidth + dims.nodeGapX)),
      y: verticalCenter,
    },
  }))
}

/**
 * Calculate safe zoom level based on expected node expansion
 * Prevents nodes from going outside viewport when fields populate
 */
export function calculateSafeZoom(
  nodeCount: number,
  estimatedFieldsPerNode: number = 5
): number {
  // Estimate expanded node height: base (100px) + fields (30px each)
  const estimatedHeight = 100 + (estimatedFieldsPerNode * 30)

  // More fields = need more zoom out
  // 1-3 fields: 0.7 zoom
  // 4-6 fields: 0.6 zoom
  // 7+ fields: 0.5 zoom
  if (estimatedFieldsPerNode <= 3) return 0.7
  if (estimatedFieldsPerNode <= 6) return 0.6
  return 0.5
}

/**
 * Update node state (skeleton, ready, running, passed, failed)
 * Changes the visual appearance and className of a node
 */
export function setNodeState(
  instance: ReactFlowInstance,
  nodeId: string,
  state: 'skeleton' | 'ready' | 'running' | 'passed' | 'failed'
) {
  if (!instance) return

  instance.setNodes((nodes) =>
    nodes.map((node) => {
      if (node.id === nodeId) {
        const stateClass = `node-${state}`
        return {
          ...node,
          data: {
            ...node.data,
            state,
          },
          className: stateClass,
        }
      }
      return node
    })
  )
}
