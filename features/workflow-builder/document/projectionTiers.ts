import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";

/**
 * Document Builder — graph-shape capability tiers (5.DUAL-BUILDER-1 / CS-1).
 *
 * Pure, React-free classification helpers for the graph→Document projection
 * (`projection.ts`). The Document renders three honesty tiers:
 *
 *   - Tier A — readable prose: linear chains, supported If/Then + Router forks
 *     with disjoint lanes that terminate or reconverge at ONE unambiguous node,
 *     nesting to `MAX_FORK_DEPTH`.
 *   - Tier B — a compact read-only "complex region" block (per-REGION, never
 *     per-workflow): cross-lane edges, non-branch fan-out, ambiguous
 *     reconvergence, too-deep nesting, unknown node types, broken branch
 *     wiring. The rest of the Document stays fully readable.
 *   - Tier C — the whole graph cannot be expressed as prose (cycles, multiple
 *     triggers): one safe fallback region, never misleading Tier A sentences.
 *
 * These helpers NEVER mutate their inputs and never throw for any
 * WorkflowDefinition-shaped in-memory graph. Branch semantics are owned by
 * `core/workflows/branchWiring` + persisted `edge.label` — nothing here reads
 * positions, edge order (beyond documented deterministic tie-breaks), or any
 * canvas/React-Flow concept.
 */

/** Maximum editable/readable fork nesting depth (planning doc §5 Tier A). */
export const MAX_FORK_DEPTH = 3;

/** Why a region (or the whole graph) degraded out of Tier A. */
export type ComplexRegionReason =
  // Tier C (whole graph)
  | "cycle"
  | "multiple_triggers"
  // Tier B (per region)
  | "disconnected"
  | "parallel_fan_out"
  | "labeled_edge_non_branching"
  | "cross_lane"
  | "ambiguous_rejoin"
  | "nesting_too_deep"
  | "branch_wiring"
  | "branch_config_invalid"
  | "unknown_node_type";

/** Reasons that always mean the WHOLE graph falls back (Tier C). */
export const TIER_C_REASONS: ReadonlySet<ComplexRegionReason> = new Set([
  "cycle",
  "multiple_triggers",
]);

/** Plain-language explanation per reason (matches validation-drawer tone). */
export function complexRegionMessage(reason: ComplexRegionReason): string {
  switch (reason) {
    case "cycle":
      return "This workflow loops back on itself, which the Document can't show as a straight read. Open it on the canvas.";
    case "multiple_triggers":
      return "This workflow has more than one trigger, which the Document can't show as a straight read. Open it on the canvas.";
    case "disconnected":
      return "These steps aren't connected to the rest of the workflow yet.";
    case "parallel_fan_out":
      return "This part runs several paths at once — easier to see on the canvas.";
    case "labeled_edge_non_branching":
      return "This part has route labels on a step that doesn't split, so the Document can't read it safely.";
    case "cross_lane":
      return "These branch paths cross into each other — easier to see on the canvas.";
    case "ambiguous_rejoin":
      return "These branch paths come back together in more than one place — easier to see on the canvas.";
    case "nesting_too_deep":
      return "This part has branches nested deeper than the Document shows. Open it on the canvas.";
    case "branch_wiring":
      return "This split has a route that isn't wired up the way it will run. Fix its connections on the canvas.";
    case "branch_config_invalid":
      return "This split isn't fully set up yet, so the Document can't show its routes. Finish it on the canvas.";
    case "unknown_node_type":
      return "ChainReact doesn't have display details for this step, so the Document shows it as-is.";
  }
}

/**
 * Detect whether the (valid-edge) graph contains any directed cycle,
 * including self-loops. Iterative three-color DFS; deterministic (node array
 * order). Returns the ids of every node that participates in / leads into a
 * cycle-bearing traversal — or null when acyclic.
 */
export function findCycle(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): readonly string[] | null {
  const ids = new Set(nodes.map((n) => n.id));
  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    if (e.from === e.to) return [e.from];
    const bucket = out.get(e.from);
    if (bucket) bucket.push(e.to);
    else out.set(e.from, [e.to]);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) if (!color.has(n.id)) color.set(n.id, WHITE);

  for (const root of nodes) {
    if (color.get(root.id) !== WHITE) continue;
    // Stack of [nodeId, nextChildIndex]; path tracks the gray chain.
    const stack: Array<[string, number]> = [[root.id, 0]];
    const path: string[] = [];
    color.set(root.id, GRAY);
    path.push(root.id);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const children = out.get(frame[0]) ?? [];
      if (frame[1] < children.length) {
        const child = children[frame[1]]!;
        frame[1] += 1;
        const c = color.get(child);
        if (c === GRAY) {
          // Found a back edge — return the cycle segment of the gray path.
          const start = path.indexOf(child);
          return path.slice(start === -1 ? 0 : start);
        }
        if (c === WHITE) {
          color.set(child, GRAY);
          path.push(child);
          stack.push([child, 0]);
        }
      } else {
        color.set(frame[0], BLACK);
        stack.pop();
        path.pop();
      }
    }
  }
  return null;
}
