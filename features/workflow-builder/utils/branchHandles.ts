import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { isAdvancedBranchingNode } from "@/core/workflows/advancedBranching";
import { returnableBranchLabels } from "@/core/workflows/branchWiring";

/**
 * Branch source-handle model (BRANCH-ENT-1 C4).
 *
 * Branching nodes (If/Then Condition, Router) render ONE ReactFlow source
 * handle per route the node can return, plus one "Always" handle for the
 * always-run cleanup path. The handle id IS the stable route identity:
 * an edge drawn from `branch:<label>` persists `edge.label = <label>`, and a
 * persisted labeled edge re-attaches to `branch:<label>` on load. Visual
 * position is never the source of truth — swapping handle order, moving the
 * node, or re-laying-out the canvas cannot change which route an edge means.
 */

export const BRANCH_HANDLE_PREFIX = "branch:";

/** The always-run (unlabeled cleanup) source handle on a branching node. */
export const BRANCH_ALWAYS_HANDLE_ID = "branch-always";

export function branchHandleId(label: string): string {
  return `${BRANCH_HANDLE_PREFIX}${label}`;
}

/**
 * The branch label a connection's `sourceHandle` encodes, or undefined for
 * the default/always handle (→ an unlabeled cleanup edge).
 */
export function labelFromBranchHandle(
  sourceHandle: string | null | undefined,
): string | undefined {
  if (!sourceHandle || sourceHandle === BRANCH_ALWAYS_HANDLE_ID) return undefined;
  if (!sourceHandle.startsWith(BRANCH_HANDLE_PREFIX)) return undefined;
  const label = sourceHandle.slice(BRANCH_HANDLE_PREFIX.length);
  return label.length > 0 ? label : undefined;
}

/** Friendly display for a route label ("true" → "True", "false" → "False"). */
export function branchLabelDisplay(label: string): string {
  if (label === "true") return "True";
  if (label === "false") return "False";
  return label;
}

/**
 * Per-node branch-handle label lists for the whole graph. A branching node's
 * list is its returnable vocabulary (config order) plus any EXTRA labels its
 * existing outgoing edges still carry (so a stale edge stays visible and
 * attachable until the user or config reconciliation removes it — never an
 * invisible dangling connection). Non-branching nodes are absent (they keep
 * the single default source handle).
 */
export function computeBranchHandleLabels(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, readonly string[]>();
  for (const node of nodes) {
    if (!isAdvancedBranchingNode(node)) continue;
    const labels: string[] = [...(returnableBranchLabels(node) ?? [])];
    const seen = new Set(labels);
    for (const edge of edges) {
      if (edge.from !== node.id || edge.label === undefined) continue;
      if (!seen.has(edge.label)) {
        seen.add(edge.label);
        labels.push(edge.label);
      }
    }
    map.set(node.id, labels);
  }
  return map;
}
