/**
 * Deterministic vertical layout for AI-applied simple linear workflows
 * (Slice 4.AI-35G).
 *
 * The planner model is NOT given positioning guidance, so AI-generated patches
 * often place nodes side-by-side (same `y`) or at arbitrary coordinates. The
 * builder's own convention (graphSlice) is a strict vertical column — trigger on
 * top, each subsequent node {@link VERTICAL_NODE_SPACING}px below, all sharing
 * the head node's `x`. This helper normalizes an applied definition to that
 * column so AI-created workflows read top-to-bottom like hand-built ones.
 *
 * Deliberately conservative — it runs ONLY when ALL hold, otherwise the
 * definition is returned untouched:
 *   - the patch ADDS structure (`addNode` / `replaceTrigger`). A pure config
 *     edit (`updateNodeConfig` only) never relayouts the graph.
 *   - the patch carries NO explicit `moveNode` (that is an intentional position
 *     the user/model chose — respect it).
 *   - the resulting graph is a SIMPLE LINEAR CHAIN: one head (in-degree 0), every
 *     node in-degree ≤ 1 and out-degree ≤ 1, no labeled (branch/router) edges,
 *     no cycle, single connected component covering every node.
 *
 * Branching / router / multi-component graphs keep their positions — auto-laying
 * those out is a separate concern and out of scope. Pure (no mutation, no I/O,
 * no registry); operates only on node kinds, edges, and positions.
 */

import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import type { PatchOperation } from "@/services/workflows/patch/types";

/** Vertical gap between stacked nodes — matches the builder's graphSlice convention. */
export const VERTICAL_NODE_SPACING = 120;

function patchAddsStructure(operations: readonly PatchOperation[]): boolean {
  return operations.some((o) => o.op === "addNode" || o.op === "replaceTrigger");
}

function patchHasExplicitMove(operations: readonly PatchOperation[]): boolean {
  return operations.some((o) => o.op === "moveNode");
}

/**
 * Return the nodes in head→tail order IFF the definition is a simple linear
 * chain; otherwise `null` (caller leaves positions untouched).
 */
function linearOrder(def: WorkflowDefinition): WorkflowNode[] | null {
  const nodes = def.nodes;
  if (nodes.length === 0) return null;
  // A labeled edge marks a branch/router construct — not a simple linear chain.
  if (def.edges.some((e) => e.label)) return null;

  const indeg = new Map<string, number>();
  const outTargets = new Map<string, string[]>();
  for (const n of nodes) {
    indeg.set(n.id, 0);
    outTargets.set(n.id, []);
  }
  for (const e of def.edges) {
    if (!indeg.has(e.from) || !indeg.has(e.to)) return null; // dangling edge
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    outTargets.get(e.from)!.push(e.to);
  }
  for (const n of nodes) {
    if (outTargets.get(n.id)!.length > 1) return null; // fan-out (branch)
    if ((indeg.get(n.id) ?? 0) > 1) return null; // fan-in (merge)
  }

  const heads = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0);
  if (heads.length !== 1) return null; // 0 heads (cycle) or >1 (disconnected)

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const order: WorkflowNode[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = heads[0]!.id;
  while (cur !== undefined) {
    const currentId: string = cur;
    if (seen.has(currentId)) return null; // cycle
    seen.add(currentId);
    const node = byId.get(currentId);
    if (!node) return null;
    order.push(node);
    const next: string[] = outTargets.get(currentId) ?? [];
    cur = next.length === 1 ? next[0] : undefined;
  }
  if (order.length !== nodes.length) return null; // disconnected node(s)
  return order;
}

export function normalizeLinearWorkflowLayout(
  def: WorkflowDefinition,
  operations: readonly PatchOperation[],
): WorkflowDefinition {
  if (!patchAddsStructure(operations)) return def;
  if (patchHasExplicitMove(operations)) return def;

  const order = linearOrder(def);
  if (!order) return def;

  // Anchor on the head node's current position so the graph stays where it is
  // on the canvas; align every node to that x and stack vertically.
  const anchor = order[0]!.position;
  const indexById = new Map(order.map((n, i) => [n.id, i]));

  return {
    ...def,
    nodes: def.nodes.map((n) => {
      const i = indexById.get(n.id);
      if (i === undefined) return n;
      return { ...n, position: { x: anchor.x, y: anchor.y + i * VERTICAL_NODE_SPACING } };
    }),
  };
}
