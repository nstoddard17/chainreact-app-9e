/**
 * Pure graph-topology helper for "which nodes can the current node
 * reference as a variable source?"
 *
 * Slice 3.7 — used by the variable picker. The runtime engine seeds
 * `context.variables[<nodeId>] = <node output>` only after a node has
 * executed; at design time the picker mirrors that contract by only
 * surfacing UPSTREAM nodes — strict ancestors of the current node in
 * the DAG.
 *
 * Lives in `core/workflows/` so both the builder (which can't import
 * `services/execution/`) and any future agent surface can reuse the
 * same pure helper. The runtime engine has its own `bfsExecutionOrder`
 * for forward traversal; this helper is the REVERSE direction (find
 * the ancestors) and is intentionally a separate concern.
 *
 * Cycle safety: even though `WorkflowDefinitionSchema` does NOT
 * enforce acyclicity (the engine handles cycles at runtime), this
 * helper must terminate. A visited-set guards the BFS.
 */

import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflow";

export interface UpstreamLookupInput {
  currentNodeId: string;
  nodes: readonly WorkflowNode[];
  edges: readonly WorkflowEdge[];
}

/**
 * Return the set of node ids that are strict ANCESTORS of
 * `currentNodeId` — i.e. nodes that can reach `currentNodeId` by
 * following one or more edges in the `from → to` direction.
 *
 * Excludes `currentNodeId` itself and everything downstream.
 *
 * The traversal walks edges in the REVERSE direction (from `to` to
 * `from`) starting at `currentNodeId`. Each visited id is collected
 * once; cycles terminate naturally on the visited check.
 *
 * Unknown `currentNodeId` (not present in `nodes`) returns an empty
 * set — the picker treats this as "no upstream sources available"
 * rather than throwing.
 */
export function findUpstreamNodes({
  currentNodeId,
  nodes,
  edges,
}: UpstreamLookupInput): readonly string[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (!nodeIds.has(currentNodeId)) return [];

  // Build a reverse-adjacency map once. O(edges) construction,
  // O(1) lookup per visited node.
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    const list = incoming.get(edge.to);
    if (list) list.push(edge.from);
    else incoming.set(edge.to, [edge.from]);
  }

  const visited = new Set<string>();
  const ancestors = new Set<string>();
  const queue: string[] = [currentNodeId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const parents = incoming.get(id);
    if (!parents) continue;
    for (const p of parents) {
      if (p === currentNodeId) continue; // self-loops never become ancestors
      if (!ancestors.has(p)) {
        ancestors.add(p);
        queue.push(p);
      }
    }
  }

  return [...ancestors];
}
