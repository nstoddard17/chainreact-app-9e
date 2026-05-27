import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflow";
import {
  deleteNodeFromGraph,
  type DeleteNodeFromGraphResult,
} from "./deleteNodeFromGraph";

/**
 * Pure intent classifier for the canvas keyboard-delete path
 * (Slice 4.BUILDER-NODE-DELETE-2).
 *
 * Inputs:
 *   - `selectedNodeIds` — the node ids ReactFlow's `onBeforeDelete` is about
 *     to delete. Edges go through their own callback and are intentionally
 *     ignored by this helper.
 *   - `pendingNodes` / `pendingEdges` — current graph state from `useGraphSlice`.
 *
 * Output:
 *   - `{ kind: "proceed" }` — let ReactFlow proceed with the deletion. Emitted
 *     when the keyboard intent affects zero nodes (edge-only deletion).
 *   - `{ kind: "multi", count }` — multi-select with 2+ nodes. The canvas
 *     surfaces a "select one at a time" dialog and does not delete anything.
 *     v1 deliberately blocks multi-select rather than fanning out the rewire
 *     logic across multiple nodes; the rewire helper's semantics for "delete
 *     A then B" depend on the order chosen, and we don't want to expose that
 *     ambiguity to keyboard users. A future slice can grow this surface
 *     (e.g. with a "delete N nodes" preview).
 *   - `{ kind: "single", nodeId, preview }` — exactly one node. `preview` is
 *     the dry-run output of `deleteNodeFromGraph` against current graph
 *     state. The canvas mounts the same `DeleteNodeConfirmDialog` the
 *     inspector uses, fed with this preview.
 *
 * Purity contract:
 *   - No slice reads. Callers pass `pendingNodes` / `pendingEdges` in.
 *   - No mutation. The dry-run helper returns fresh arrays; this function
 *     does not write anywhere.
 *   - No DOM / React Flow access. The hook layer
 *     (`useCanvasNodeDeletion`) wires this into React Flow's
 *     `onBeforeDelete` callback.
 */

export type KeyboardDeleteIntent =
  | { readonly kind: "proceed" }
  | { readonly kind: "multi"; readonly count: number }
  | {
      readonly kind: "single";
      readonly nodeId: string;
      readonly preview: DeleteNodeFromGraphResult;
    };

export interface ComputeKeyboardDeleteIntentInput {
  readonly selectedNodeIds: readonly string[];
  readonly pendingNodes: readonly WorkflowNode[];
  readonly pendingEdges: readonly WorkflowEdge[];
}

export function computeKeyboardDeleteIntent(
  input: ComputeKeyboardDeleteIntentInput,
): KeyboardDeleteIntent {
  const { selectedNodeIds, pendingNodes, pendingEdges } = input;
  if (selectedNodeIds.length === 0) {
    return { kind: "proceed" };
  }
  if (selectedNodeIds.length > 1) {
    return { kind: "multi", count: selectedNodeIds.length };
  }
  const nodeId = selectedNodeIds[0]!;
  const preview = deleteNodeFromGraph({
    nodes: pendingNodes,
    edges: pendingEdges,
    nodeId,
  });
  return { kind: "single", nodeId, preview };
}
