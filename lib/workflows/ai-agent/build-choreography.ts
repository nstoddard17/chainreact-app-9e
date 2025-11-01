/**
 * Build Choreography - Animated node placement and camera movements
 * Implements the spec for skeleton building, zoom-fit, and sequential focus
 */

import { Node, Edge } from '@xyflow/react'
import { DESIGN_TOKENS } from './design-tokens'
import { logger } from '@/lib/utils/logger'

export interface ChoreographyOptions {
  preferReducedMotion?: boolean
  onStageChange?: (stage: ChoreographyStage) => void
  onNodeFocus?: (nodeId: string) => void
}

export type ChoreographyStage =
  | 'idle'
  | 'zoom-fit'
  | 'skeleton-build'
  | 'focus-first'
  | 'guided-setup'
  | 'complete'

export interface BuildPhase {
  stage: ChoreographyStage
  targetNodeId?: string
  badgeText: string
  badgeSubtext?: string
}

export class BuildChoreographer {
  private currentStage: ChoreographyStage = 'idle'
  private options: ChoreographyOptions

  constructor(options: ChoreographyOptions = {}) {
    this.options = options
  }

  /**
   * Execute full build choreography
   */
  async executeBuildSequence(
    nodes: Node[],
    edges: Edge[],
    reactFlowInstance: any
  ): Promise<void> {
    try {
      // Phase 1: Zoom to fit (padding 64px, target zoom ~0.85)
      await this.zoomToFit(reactFlowInstance)

      // Phase 2: Build skeleton with staggered placement
      await this.buildSkeleton(nodes, reactFlowInstance)

      // Phase 3: Focus first node
      await this.focusFirstNode(nodes[0], reactFlowInstance)

      // Phase 4: Mark as complete
      this.setStage('complete')
    } catch (error) {
      logger.error('Build choreography failed', { error })
    }
  }

  /**
   * Phase 1: Zoom to fit all nodes
   */
  private async zoomToFit(reactFlowInstance: any): Promise<void> {
    this.setStage('zoom-fit')

    if (this.options.preferReducedMotion) {
      // Instant transition for reduced motion
      reactFlowInstance.fitView({
        padding: DESIGN_TOKENS.CANVAS_FIT_PADDING,
        maxZoom: DESIGN_TOKENS.CANVAS_DEFAULT_ZOOM,
        duration: 0
      })
      return
    }

    // Animated transition
    await new Promise<void>((resolve) => {
      reactFlowInstance.fitView({
        padding: DESIGN_TOKENS.CANVAS_FIT_PADDING,
        maxZoom: DESIGN_TOKENS.CANVAS_DEFAULT_ZOOM,
        duration: DESIGN_TOKENS.CAMERA_PAN_DURATION
      })

      setTimeout(resolve, DESIGN_TOKENS.CAMERA_PAN_DURATION + 50)
    })
  }

  /**
   * Phase 2: Place nodes with skeleton styling and stagger
   */
  private async buildSkeleton(nodes: Node[], reactFlowInstance: any): Promise<void> {
    this.setStage('skeleton-build')

    if (this.options.preferReducedMotion) {
      // Place all nodes instantly
      return
    }

    // Stagger node placement
    for (let i = 0; i < nodes.length; i++) {
      await new Promise(resolve =>
        setTimeout(resolve, DESIGN_TOKENS.BUILD_STAGGER_DELAY)
      )

      // Trigger visual update for this node
      // The actual styling is handled by the node component based on state
    }

    // Brief hold on skeleton view
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  /**
   * Phase 3: Pan/zoom to first node and add halo
   */
  private async focusFirstNode(firstNode: Node, reactFlowInstance: any): Promise<void> {
    if (!firstNode) return

    this.setStage('focus-first')

    if (this.options.preferReducedMotion) {
      // Instant focus
      reactFlowInstance.setCenter(
        firstNode.position.x + 225, // Half of NODE_WIDTH
        firstNode.position.y + 100,
        { zoom: 1, duration: 0 }
      )
      this.options.onNodeFocus?.(firstNode.id)
      return
    }

    // Animated pan to first node
    await new Promise<void>((resolve) => {
      reactFlowInstance.setCenter(
        firstNode.position.x + 225,
        firstNode.position.y + 100,
        {
          zoom: 1,
          duration: DESIGN_TOKENS.CAMERA_PAN_DURATION
        }
      )

      setTimeout(() => {
        this.options.onNodeFocus?.(firstNode.id)
        resolve()
      }, DESIGN_TOKENS.CAMERA_PAN_DURATION)
    })
  }

  /**
   * Focus on a specific node (used during guided setup)
   */
  async focusNode(node: Node, reactFlowInstance: any): Promise<void> {
    if (!node) return

    if (this.options.preferReducedMotion) {
      reactFlowInstance.setCenter(
        node.position.x + 225,
        node.position.y + 100,
        { zoom: 1, duration: 0 }
      )
      this.options.onNodeFocus?.(node.id)
      return
    }

    await new Promise<void>((resolve) => {
      reactFlowInstance.setCenter(
        node.position.x + 225,
        node.position.y + 100,
        {
          zoom: 1,
          duration: DESIGN_TOKENS.CAMERA_PAN_DURATION
        }
      )

      setTimeout(() => {
        this.options.onNodeFocus?.(node.id)
        resolve()
      }, DESIGN_TOKENS.CAMERA_PAN_DURATION)
    })
  }

  /**
   * Get badge configuration for current stage
   */
  getBadgeConfig(): { text: string; subtext?: string } {
    switch (this.currentStage) {
      case 'zoom-fit':
      case 'skeleton-build':
        return {
          text: 'Agent building flow',
          subtext: undefined
        }
      case 'focus-first':
        return {
          text: 'Agent building flow',
          subtext: 'Waiting for user action'
        }
      case 'guided-setup':
        return {
          text: 'Preparing node…',
          subtext: undefined
        }
      case 'complete':
        return {
          text: 'Flow ready ✅',
          subtext: undefined
        }
      default:
        return {
          text: '',
          subtext: undefined
        }
    }
  }

  private setStage(stage: ChoreographyStage): void {
    this.currentStage = stage
    this.options.onStageChange?.(stage)
  }

  getCurrentStage(): ChoreographyStage {
    return this.currentStage
  }
}

/**
 * Helper to calculate node positions with branch awareness
 */
export function calculateNodePositions(
  nodes: Array<{ id: string; type: string; branchIndex?: number }>,
  edges: Array<{ source: string; target: string }>
): Array<{ id: string; x: number; y: number }> {
  const positions: Array<{ id: string; x: number; y: number }> = []
  const processedNodes = new Set<string>()

  // Find root node (no incoming edges)
  const incomingEdges = new Map<string, number>()
  edges.forEach(edge => {
    incomingEdges.set(edge.target, (incomingEdges.get(edge.target) || 0) + 1)
  })

  const rootNodes = nodes.filter(n => !incomingEdges.has(n.id))
  if (rootNodes.length === 0) {
    // Fallback: use first node
    rootNodes.push(nodes[0])
  }

  // Simple left-to-right layout with branch awareness
  let currentX = 100
  let currentY = 100

  const queue: Array<{ id: string; x: number; y: number; branchIndex: number }> = []
  rootNodes.forEach((node, idx) => {
    queue.push({
      id: node.id,
      x: currentX,
      y: currentY + (idx * DESIGN_TOKENS.BRANCH_LANE_OFFSET),
      branchIndex: idx
    })
  })

  while (queue.length > 0) {
    const current = queue.shift()!
    if (processedNodes.has(current.id)) continue

    processedNodes.add(current.id)
    positions.push({ id: current.id, x: current.x, y: current.y })

    // Find children
    const children = edges
      .filter(e => e.source === current.id)
      .map(e => nodes.find(n => n.id === e.target)!)
      .filter(Boolean)

    children.forEach((child, idx) => {
      if (processedNodes.has(child.id)) return

      queue.push({
        id: child.id,
        x: current.x + DESIGN_TOKENS.NODE_GAP_X,
        y: current.y + (idx * DESIGN_TOKENS.NODE_GAP_Y),
        branchIndex: current.branchIndex + idx
      })
    })
  }

  return positions
}
