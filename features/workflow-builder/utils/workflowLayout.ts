import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import type { WorkflowNodePosition } from "@/contracts/workflowDefinition";

/**
 * Pure canvas-layout helpers (Slice 4.BUILDER-CANVAS-LAYOUT-1).
 *
 * Kept pure (no slice / fetch / DOM access) so they are trivially testable and
 * reusable from the graph slice, agents, or future batch ops — mirroring the
 * `deleteNodeFromGraph` helper convention. They own the deterministic geometry
 * the builder uses to (a) place a newly appended node without overlapping any
 * existing node and (b) re-arrange the whole graph into a clean, readable
 * top-down layout.
 *
 * Geometry conventions (match the existing V2 builder):
 *   - Single vertical column at x = 0 for a linear chain (trigger at {0,0},
 *     each subsequent step one ROW_GAP below — the same spacing the old
 *     `addAction` heuristic produced for a freshly-built chain).
 *   - Parallel branches fan out horizontally by BRANCH_GAP_X (node card is
 *     280px wide, so 320 leaves a comfortable gutter and never overlaps).
 */

/** Single-column x for a linear chain. */
export const LAYOUT_COLUMN_X = 0;
/** Vertical gap between chained steps (row height). */
export const LAYOUT_ROW_GAP_Y = 120;
/** Horizontal gap between parallel branches (card 280px + gutter). */
export const LAYOUT_BRANCH_GAP_X = 320;

/**
 * Overlap bounding box. A node card is ~280px wide and ~100px tall. Two nodes
 * are treated as overlapping when their centers are closer than the card span
 * on BOTH axes. ROW_GAP (120) > the vertical span (100), so vertically-adjacent
 * rows never read as overlapping; an exact-same position always does.
 */
const NODE_OVERLAP_X = 280;
const NODE_OVERLAP_Y = 100;

/** Do two positions overlap (their node boxes intersect)? Pure. */
export function positionsOverlap(a: WorkflowNodePosition, b: WorkflowNodePosition): boolean {
  return Math.abs(a.x - b.x) < NODE_OVERLAP_X && Math.abs(a.y - b.y) < NODE_OVERLAP_Y;
}

/**
 * The single "chain tail" — an `action` node with NO outgoing edge — when there
 * is EXACTLY ONE. That is the unambiguous end of a linear chain, so appending a
 * step there grows the chain rather than branching off the middle.
 *
 * Returns null when there are zero tails (every node has a successor — a pure
 * cycle) or two-or-more (a branch / disconnected leaf — ambiguous which is "the
 * end"), so the caller can fall back to its array-order heuristic. Pure; mirrors
 * `findSoleRootActionId`. The trigger is excluded as a tail candidate — a
 * trigger with no outgoing edge is an empty workflow start, not a chain end.
 */
export function findChainTailId(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): string | null {
  const nodesWithOutgoing = new Set(edges.map((e) => e.from));
  const tails = nodes.filter((n) => n.kind === "action" && !nodesWithOutgoing.has(n.id));
  return tails.length === 1 ? tails[0]!.id : null;
}

/**
 * Compute a non-overlapping position for a node being appended below `anchor`.
 * Starts one ROW_GAP below the anchor (same column) and steps further down by
 * ROW_GAP until the slot is clear of every node in `existing`. Deterministic and
 * always terminates (each step moves strictly down; the node set is finite).
 *
 * `existing` should be the current nodes (it may include the anchor — the first
 * candidate is already a full row below, so the anchor never blocks it).
 */
export function computeNonOverlappingPosition(
  anchor: WorkflowNodePosition,
  existing: readonly WorkflowNode[],
): WorkflowNodePosition {
  let candidate: WorkflowNodePosition = { x: anchor.x, y: anchor.y + LAYOUT_ROW_GAP_Y };
  while (existing.some((n) => positionsOverlap(n.position, candidate))) {
    candidate = { x: candidate.x, y: candidate.y + LAYOUT_ROW_GAP_Y };
  }
  return candidate;
}

/**
 * Collect a node and every node reachable from it along outgoing edges (its
 * downstream subtree), in stable depth-first order. Cycle-safe (each node is
 * visited once) and pure. `excludeId` is never collected nor traversed — used by
 * mid-chain insertion to keep the freshly-inserted node out of the subtree that
 * gets shifted (the inserted node points INTO the subtree, so a cycle could
 * otherwise loop back to it).
 *
 * Slice 4.BUILDER-CANVAS-LAYOUT-2 — used to push a chain's tail down to open a
 * clean, non-overlapping row for a node inserted mid-chain.
 */
export function collectDownstreamIds(
  edges: readonly WorkflowEdge[],
  startId: string,
  excludeId?: string,
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    const arr = childrenOf.get(e.from);
    if (arr) arr.push(e.to);
    else childrenOf.set(e.from, [e.to]);
  }
  const visited = new Set<string>();
  const result: string[] = [];
  const stack = [startId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === excludeId || visited.has(id)) continue;
    visited.add(id);
    result.push(id);
    for (const c of childrenOf.get(id) ?? []) {
      if (!visited.has(c)) stack.push(c);
    }
  }
  return result;
}

/**
 * Resolve a just-dropped node position to the nearest non-overlapping slot
 * (Slice 4.BUILDER-CANVAS-ERGONOMICS-FIX-1). The product rule is that nodes
 * must NEVER overlap — including after a manual drag-and-drop, not just on
 * add/insert.
 *
 * `others` is every node EXCEPT the one being dropped. When the dropped
 * position is already clear (the common case) it is returned unchanged, so a
 * normal drag is never disturbed. When it would overlap, the node steps down one
 * row at a time until the slot is clear — deterministic, terminating, and not
 * jarring (it only moves on a real collision, and only as far as needed).
 */
export function resolveNonOverlappingDrop(
  desired: WorkflowNodePosition,
  others: readonly WorkflowNode[],
): WorkflowNodePosition {
  let candidate: WorkflowNodePosition = { x: desired.x, y: desired.y };
  while (others.some((n) => positionsOverlap(n.position, candidate))) {
    candidate = { x: candidate.x, y: candidate.y + LAYOUT_ROW_GAP_Y };
  }
  return candidate;
}

/** Sort key for choosing/ordering roots: triggers first, then authoring order. */
function rootRank(node: WorkflowNode, index: number): number {
  return (node.kind === "trigger" ? 0 : 1) * 1_000_000 + index;
}

/**
 * Re-arrange ALL nodes into a clean, deterministic, non-overlapping top-down
 * layout. Pure: returns a new node array (positions replaced); nodes whose
 * computed position is unchanged are returned by reference so the caller can
 * cheaply detect a no-op.
 *
 * Algorithm (small graphs — builder workflows):
 *   1. Split into connected components (undirected) so disconnected pieces never
 *      collide; components stack vertically in authoring order.
 *   2. Per component: roots = indegree-0 nodes (triggers first); BFS along
 *      outgoing edges assigns each node a depth (row), first-visit wins. A pure
 *      cycle with no indegree-0 entry seeds from its stable-first member; any
 *      node a cycle leaves unreached is stacked below.
 *   3. Each depth is a row (y = row * ROW_GAP); nodes sharing a row fan out into
 *      columns (x = col * BRANCH_GAP_X) in authoring order. A linear chain → one
 *      column at x = 0, exactly the existing convention.
 */
export function layoutWorkflowGraph(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): WorkflowNode[] {
  if (nodes.length === 0) return [...nodes];

  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outAdj = new Map<string, string[]>();
  const undirected = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const n of nodes) {
    outAdj.set(n.id, []);
    undirected.set(n.id, new Set());
    indegree.set(n.id, 0);
  }
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    outAdj.get(e.from)!.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
    undirected.get(e.from)!.add(e.to);
    undirected.get(e.to)!.add(e.from);
  }

  // 1. Connected components (undirected), seeded in authoring order.
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const comp: string[] = [];
    const queue = [n.id];
    seen.add(n.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      comp.push(id);
      for (const m of undirected.get(id)!) {
        if (!seen.has(m)) {
          seen.add(m);
          queue.push(m);
        }
      }
    }
    components.push(comp);
  }

  const pos = new Map<string, WorkflowNodePosition>();
  let rowOffset = 0;

  for (const comp of components) {
    // 2. Roots = indegree-0 within the component (triggers first); fall back to
    // the stable-first member for a pure cycle with no entry point.
    let roots = comp.filter((id) => (indegree.get(id) ?? 0) === 0);
    roots.sort((a, b) => rootRank(byId.get(a)!, index.get(a)!) - rootRank(byId.get(b)!, index.get(b)!));
    if (roots.length === 0) {
      roots = [comp.slice().sort((a, b) => index.get(a)! - index.get(b)!)[0]!];
    }

    const depth = new Map<string, number>();
    const queue: string[] = [];
    for (const r of roots) {
      depth.set(r, 0);
      queue.push(r);
    }
    while (queue.length > 0) {
      const id = queue.shift()!;
      const d = depth.get(id)!;
      for (const c of outAdj.get(id)!) {
        if (!depth.has(c)) {
          depth.set(c, d + 1);
          queue.push(c);
        }
      }
    }
    // Cycle remnants the BFS never reached → stack below, stable order.
    let maxDepth = 0;
    for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);
    const unreached = comp.filter((id) => !depth.has(id)).sort((a, b) => index.get(a)! - index.get(b)!);
    for (const id of unreached) {
      maxDepth += 1;
      depth.set(id, maxDepth);
    }

    // 3. Group by depth → rows; fan siblings into columns, authoring order.
    const rows = new Map<number, string[]>();
    for (const id of comp) {
      const d = depth.get(id)!;
      const row = rows.get(d);
      if (row) row.push(id);
      else rows.set(d, [id]);
    }
    let compMaxRow = 0;
    for (const [d, ids] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      ids.sort((a, b) => index.get(a)! - index.get(b)!);
      ids.forEach((id, col) => {
        pos.set(id, {
          x: LAYOUT_COLUMN_X + col * LAYOUT_BRANCH_GAP_X,
          y: (rowOffset + d) * LAYOUT_ROW_GAP_Y,
        });
      });
      compMaxRow = Math.max(compMaxRow, d);
    }
    // Blank row between stacked components for breathing room.
    rowOffset += compMaxRow + 2;
  }

  return nodes.map((n) => {
    const p = pos.get(n.id)!;
    return n.position.x === p.x && n.position.y === p.y ? n : { ...n, position: p };
  });
}
