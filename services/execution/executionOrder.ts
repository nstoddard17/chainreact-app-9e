import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflow";

/**
 * Workflow-graph traversal helpers. Extracted from `engine.ts` (max-lines
 * lint cleanup, AI-28 follow-up). Pure module — no dependencies on the
 * engine itself.
 */

/**
 * Breadth-first execution order starting at the trigger node. The visited
 * set bounds traversal to one visit per node id, so a graph with cycles
 * still terminates (each node executes at most once per run).
 */
export function bfsExecutionOrder(
  triggerNodeId: string,
  def: WorkflowDefinition,
): readonly WorkflowNode[] {
  const adjacency = buildAdjacency(def.edges);
  const nodesById = new Map(def.nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const order: WorkflowNode[] = [];
  const queue: string[] = [triggerNodeId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodesById.get(id);
    if (node) order.push(node);
    for (const next of adjacency.get(id) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return order;
}

export function buildAdjacency(
  edges: readonly WorkflowEdge[],
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    let bucket = map.get(edge.from);
    if (!bucket) {
      bucket = [];
      map.set(edge.from, bucket);
    }
    bucket.push(edge.to);
  }
  return map;
}
