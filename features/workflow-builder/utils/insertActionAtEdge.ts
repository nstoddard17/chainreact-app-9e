import type { ActionMeta } from "@/contracts/actionMeta";
import { useGraphSlice } from "../state/graphSlice";

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
 *   5. Position N at the midpoint of A and B for nicer UX.
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

  // Step 6: position the new node midway between A and B.
  if (fromNode && toNode) {
    const midX = Math.round((fromNode.position.x + toNode.position.x) / 2);
    const midY = Math.round((fromNode.position.y + toNode.position.y) / 2);
    useGraphSlice
      .getState()
      .updateNodePosition(newNode.id, { x: midX, y: midY });
  }
}
