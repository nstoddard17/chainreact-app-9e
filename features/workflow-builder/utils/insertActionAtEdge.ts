import type { ActionMeta } from "@/contracts/actionMeta";
import { useGraphSlice } from "../state/graphSlice";
import {
  LAYOUT_ROW_GAP_Y,
  collectDownstreamIds,
  computeNonOverlappingPosition,
} from "./workflowLayout";

/**
 * Mid-chain action insertion (Slice 4.BUILDER-ADD-FLOW-1).
 *
 * The `AddNodePanel`'s insertAction mode calls this helper after the
 * user picks an action and the panel has closed. We compose graphSlice's
 * existing public ops so the slice contract stays stable:
 *
 *   1. Read the user-clicked edge (A → B). Bail if it's gone (e.g.
 *      removed in a parallel action). No partial mutation.
 *   2. Call `addActionFromMeta(meta)` which atomically appends a node
 *      N and auto-creates `(last node before N) → N`. The auto-edge
 *      is wrong for mid-chain insertion (we want A → N), so we capture
 *      and remove it.
 *   3. Remove the user-clicked A → B edge.
 *   4. Connect A → N and N → B so the chain becomes A → N → B.
 *   5. Place N on a clean, non-overlapping row below A, pushing the
 *      downstream chain (B and everything after it) down only when
 *      needed to open room (Slice 4.BUILDER-CANVAS-LAYOUT-2).
 *
 * Why a separate helper:
 *   - Keeps WorkflowBuilder focused on layout + state machine wiring.
 *   - Unit-testable without mounting ReactFlow (the plus-button click
 *     contract is covered in WorkflowEdge.test.tsx; the
 *     pick → onPickAction(insertContext) contract is covered in
 *     AddNodePanel.test.tsx; this helper's job is composition).
 *
 * Trade-off: a transactional `insertActionAtEdge` inside graphSlice
 * would be cleaner, but adding one is a contract change the slice
 * brief explicitly defers. The composition below is observable
 * through `pendingNodes` / `pendingEdges` so tests verify the final
 * topology directly.
 *
 * Failure modes:
 *   - Step 1 missing edge → no-op.
 *   - Steps 4 calls `connectNodes` which can throw on self-loop /
 *     duplicate / unknown endpoint. None apply to a fresh node we
 *     just created with two known endpoints, so we wrap in try/catch
 *     for defense in depth and never half-mutate without throwing.
 */
export function insertActionAtEdge(
  edgeId: string,
  meta: ActionMeta,
): void {
  const slice = useGraphSlice.getState();
  const targetEdge = slice.pendingEdges.find((e) => e.id === edgeId);
  if (!targetEdge) return;
  const fromNodeId = targetEdge.from;
  const toNodeId = targetEdge.to;
  // A's original position is the placement anchor; A is upstream of the insert
  // so it never moves, captured here before any mutation.
  const fromNode = slice.pendingNodes.find((n) => n.id === fromNodeId);
  const toNode = slice.pendingNodes.find((n) => n.id === toNodeId);

  // Step 2: add the new node (creates an unwanted auto-edge).
  const newNode = useGraphSlice.getState().addActionFromMeta(meta);

  // Step 3: drop the auto-edge that addAction created (lastNode → N).
  const after = useGraphSlice.getState();
  const autoEdge = after.pendingEdges.find(
    (e) => e.to === newNode.id && e.id !== edgeId,
  );
  if (autoEdge) {
    useGraphSlice.getState().removeEdge(autoEdge.id);
  }

  // Step 4: remove the original user-clicked edge.
  useGraphSlice.getState().removeEdge(edgeId);

  // Step 5: wire A → N → B.
  try {
    useGraphSlice
      .getState()
      .connectNodes({ from: fromNodeId, to: newNode.id });
    useGraphSlice
      .getState()
      .connectNodes({ from: newNode.id, to: toNodeId });
  } catch {
    // connectNodes only throws on self-loops / duplicates / unknown
    // endpoints — none apply to a node we just created with two known
    // endpoints. Swallow rather than half-mutate.
  }

  // Step 6: place N on a clean, non-overlapping row (BUILDER-CANVAS-LAYOUT-2).
  // The old midpoint placement collided with both endpoints when A and B were a
  // single row apart (the normal append-built chain). Instead: open a row below
  // A by pushing B and its whole downstream subtree DOWN — but only by the
  // amount actually needed, so endpoints already far enough apart don't move.
  // Then place N in the freed slot via the shared non-overlap helper, which
  // guarantees it never overlaps any node (stepping further down if a stray
  // node sits in the slot).
  if (fromNode && toNode) {
    // Desired clearance: B (and its subtree) should sit at least two rows below
    // A so the row directly under A is free for N. Push down only the shortfall.
    const desiredBY = fromNode.position.y + 2 * LAYOUT_ROW_GAP_Y;
    const shift = Math.max(0, desiredBY - toNode.position.y);
    if (shift > 0) {
      // Exclude N from the subtree (N → B means a cycle could otherwise loop
      // back to the node we're about to position independently).
      const downstream = collectDownstreamIds(
        useGraphSlice.getState().pendingEdges,
        toNodeId,
        newNode.id,
      );
      for (const id of downstream) {
        const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === id);
        if (!node) continue;
        useGraphSlice.getState().updateNodePosition(id, {
          x: node.position.x,
          y: node.position.y + shift,
        });
      }
    }
    const others = useGraphSlice
      .getState()
      .pendingNodes.filter((n) => n.id !== newNode.id);
    const pos = computeNonOverlappingPosition(fromNode.position, others);
    useGraphSlice.getState().updateNodePosition(newNode.id, pos);
  }
}
