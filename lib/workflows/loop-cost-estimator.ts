/**
 * Client-side passive cost estimator for the workflow builder.
 *
 * ⚠️ EXPLICITLY NON-AUTHORITATIVE
 * This provides instant feedback as nodes are added/removed.
 * It must NEVER be used for:
 *   - Billing warnings or confirmation totals
 *   - Any decision-grade cost display
 *
 * The ExecutionCostConfirmDialog always calls the server preview API
 * for authoritative numbers.
 *
 * This estimator must stay simple. If it needs to grow more
 * sophisticated, replace it with a debounced preview API call.
 */

import {
  getNodeTaskCost,
  isLoopNode,
  getLoopMaxIterations,
  estimateLoopReservation,
} from '@/lib/workflows/cost-calculator'
import type { LoopCostDetailClient } from '@/stores/workflowCostStore'

interface PassiveCostEstimate {
  estimatedTasks: number
  worstCaseTasks: number
  hasLoops: boolean
  loopDetails: LoopCostDetailClient[]
  byNode: Record<string, number>
  byProvider: Record<string, { tasks: number; count: number }>
}

interface SimpleEdge {
  source: string
  target: string
}

/**
 * Minimal client-side cost estimate for passive builder display.
 *
 * Uses a simplified approach: loop inner nodes are identified by
 * walking edges forward from each loop node (BFS, stops at nested loops).
 */
export function estimateWorkflowCost(
  nodes: any[],
  edges: SimpleEdge[]
): PassiveCostEstimate {
  const nodeMap = new Map<string, any>()
  for (const node of nodes) {
    if (node?.id) nodeMap.set(node.id, node)
  }

  // Build forward adjacency
  const adj = new Map<string, string[]>()
  for (const edge of edges) {
    if (!edge.source || !edge.target) continue
    const list = adj.get(edge.source)
    if (list) list.push(edge.target)
    else adj.set(edge.source, [edge.target])
  }

  // Flat cost
  const byNode: Record<string, number> = {}
  const byProvider: Record<string, { tasks: number; count: number }> = {}
  let flatCost = 0

  for (const node of nodes) {
    if (!node?.id || node.data?.isPlaceholder || node.data?.isTrigger) continue
    const cost = getNodeTaskCost(node)
    if (cost > 0) {
      byNode[node.id] = cost
      flatCost += cost
    }
    const providerId = node.data?.providerId || node.data?.type?.split('_')[0] || 'unknown'
    const existing = byProvider[providerId] || { tasks: 0, count: 0 }
    byProvider[providerId] = { tasks: existing.tasks + cost, count: existing.count + 1 }
  }

  // Loop expansion (simplified BFS)
  const loopDetails: LoopCostDetailClient[] = []
  let expansionDelta = 0

  for (const node of nodes) {
    if (!node?.id || !isLoopNode(node)) continue

    const innerIds = findInnerNodeIds(node.id, nodeMap, adj)
    const innerNodes = innerIds.map((id) => nodeMap.get(id)).filter(Boolean)
    const maxIterations = getLoopMaxIterations(node)
    const innerCost = innerNodes.reduce((sum: number, n: any) => sum + getNodeTaskCost(n), 0)
    const expandedCost = estimateLoopReservation(innerNodes, maxIterations)

    loopDetails.push({
      loopNodeId: node.id,
      innerCost,
      maxIterations,
      expandedCost,
    })

    expansionDelta += expandedCost - innerCost
  }

  return {
    estimatedTasks: flatCost,
    worstCaseTasks: flatCost + expansionDelta,
    hasLoops: loopDetails.length > 0,
    loopDetails,
    byNode,
    byProvider,
  }
}

/**
 * BFS from loop node to find inner nodes. Stops at nested loop boundaries.
 */
function findInnerNodeIds(
  loopNodeId: string,
  nodeMap: Map<string, any>,
  adj: Map<string, string[]>
): string[] {
  const innerIds: string[] = []
  const visited = new Set<string>()
  const queue = [...(adj.get(loopNodeId) ?? [])]

  for (const id of queue) visited.add(id)

  while (queue.length > 0) {
    const current = queue.shift()!
    const node = nodeMap.get(current)
    innerIds.push(current)

    // Stop traversal into nested loops (they get their own detail entry)
    if (node && isLoopNode(node)) continue

    for (const next of adj.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        queue.push(next)
      }
    }
  }

  return innerIds
}
