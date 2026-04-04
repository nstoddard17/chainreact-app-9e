/**
 * Server-authoritative cost computation for workflows.
 *
 * This is the SINGLE SOURCE OF TRUTH for cost calculation.
 * Used by:
 *   - taskDeduction.ts (server deduction path)
 *   - preview-cost API endpoint
 *
 * NOT imported client-side. The client uses a minimal passive estimator.
 *
 * computeCostPreview() is PURE — it returns flatCost and totalCost.
 * Callers derive chargedCost externally based on the feature flag:
 *   const chargedCost = FEATURE_FLAGS.LOOP_COST_EXPANSION
 *     ? preview.totalCost
 *     : preview.flatCost
 */

import {
  getNodeTaskCost,
  isLoopNode,
  getLoopMaxIterations,
  estimateLoopReservation,
} from '@/lib/workflows/cost-calculator'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoopCostDetail {
  loopNodeId: string
  innerNodeIds: string[]
  innerCost: number
  maxIterations: number
  expandedCost: number
}

export interface CostPreview {
  /** Cost without loop expansion — each node counted once */
  flatCost: number
  /** Cost with loop expansion — inner nodes multiplied by max iterations */
  totalCost: number
  /** Per-node cost breakdown (flat, pre-expansion) */
  breakdown: Record<string, number>
  /** Whether the workflow contains any loop nodes */
  hasLoops: boolean
  /** Details for each loop found */
  loopDetails: LoopCostDetail[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SimpleEdge {
  source: string
  target: string
}

/**
 * Find all nodes reachable from a given node by walking edges forward,
 * stopping at nodes that are themselves loop nodes (to handle nesting).
 *
 * Handles:
 *   - nested loops (stops at inner loop boundary)
 *   - sibling loops (independent traversals)
 *   - empty loops (returns empty set)
 *   - malformed graphs / cycles (visited-set prevents infinite walk)
 */
function findInnerNodes(
  loopNodeId: string,
  allNodes: Map<string, any>,
  adjacency: Map<string, string[]>
): string[] {
  const innerIds: string[] = []
  const visited = new Set<string>()
  const queue = adjacency.get(loopNodeId) ?? []

  // Seed with direct children of the loop node
  for (const childId of queue) {
    if (!visited.has(childId)) {
      visited.add(childId)
    }
  }

  // BFS from direct children
  const bfsQueue = [...visited]
  while (bfsQueue.length > 0) {
    const current = bfsQueue.shift()!
    const node = allNodes.get(current)

    // If this child is itself a loop node, include it but don't walk into it
    // (its own inner nodes are handled by a separate LoopCostDetail entry)
    if (node && isLoopNode(node)) {
      // Nested loop — counted at flat cost here; its own expansion is separate
      innerIds.push(current)
      continue
    }

    innerIds.push(current)

    // Walk forward
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        bfsQueue.push(next)
      }
    }
  }

  return innerIds
}

/**
 * Build a forward-adjacency map from edges.
 */
function buildAdjacency(edges: SimpleEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  for (const edge of edges) {
    if (!edge.source || !edge.target) continue
    const list = adj.get(edge.source)
    if (list) {
      list.push(edge.target)
    } else {
      adj.set(edge.source, [edge.target])
    }
  }
  return adj
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Compute a full cost preview for a workflow.
 *
 * Pure function — no side effects, no feature flags, no DB access.
 *
 * @param nodes  - All workflow nodes (triggers + actions + logic)
 * @param edges  - All workflow edges (source → target)
 * @returns CostPreview with both flat and loop-expanded costs
 */
export function computeCostPreview(
  nodes: any[],
  edges: SimpleEdge[]
): CostPreview {
  // Build lookup structures
  const nodeMap = new Map<string, any>()
  for (const node of nodes) {
    if (node?.id) nodeMap.set(node.id, node)
  }

  const adjacency = buildAdjacency(edges)

  // --- Flat cost (each node counted once, triggers excluded) ---
  const breakdown: Record<string, number> = {}
  let flatCost = 0

  for (const node of nodes) {
    if (!node?.id) continue
    if (node.data?.isPlaceholder) continue
    if (node.data?.isTrigger) continue

    const cost = getNodeTaskCost(node)
    if (cost > 0) {
      breakdown[node.id] = cost
      flatCost += cost
    }
  }

  // --- Loop expansion ---
  const loopDetails: LoopCostDetail[] = []
  let loopExpansionDelta = 0

  for (const node of nodes) {
    if (!node?.id) continue
    if (!isLoopNode(node)) continue

    const innerNodeIds = findInnerNodes(node.id, nodeMap, adjacency)

    // Collect the actual node objects for inner nodes (skip missing/invalid)
    const innerNodes = innerNodeIds
      .map((id) => nodeMap.get(id))
      .filter((n): n is any => n != null)

    const maxIterations = getLoopMaxIterations(node)
    const expandedCost = estimateLoopReservation(innerNodes, maxIterations)

    // Flat cost already counts each inner node once, so delta is the extra
    const innerFlatCost = innerNodes.reduce(
      (sum, n) => sum + getNodeTaskCost(n),
      0
    )

    loopDetails.push({
      loopNodeId: node.id,
      innerNodeIds,
      innerCost: innerFlatCost,
      maxIterations,
      expandedCost,
    })

    // Delta = expanded - flat (since flat already counted them once)
    loopExpansionDelta += expandedCost - innerFlatCost
  }

  const totalCost = flatCost + loopExpansionDelta
  const hasLoops = loopDetails.length > 0

  return {
    flatCost,
    totalCost,
    breakdown,
    hasLoops,
    loopDetails,
  }
}
