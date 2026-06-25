import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import type { WorkflowNodePosition } from "@/contracts/workflowDefinition";
import { computeNonOverlappingPosition, findChainTailId } from "./workflowLayout";

/**
 * Pure placement planner for an additive builder patch (HERMES-AGENT-APPLY-IN-PLACE /
 * HERMES-AGENT-APPLY-INSERT-BETWEEN). Extracted from `graphSlice.applyAdditivePatch` so the
 * placement rules are unit-testable in isolation and the slice stays small.
 *
 * Given the existing graph + the already-resolved nodes/edges to add (trigger-skip + id minting are
 * the caller's job), it decides WHERE the new chain lands and returns the nodes/edges to add plus the
 * (at most one) existing edge id to remove. It NEVER mutates inputs, mints node ids, moves existing
 * node positions, or touches existing node config. The ONLY destructive op it ever proposes is
 * replacing exactly ONE existing unlabeled edge during an `inserted_between` split.
 *
 * Placement priority (first match wins):
 *   - blank graph → `blank` (origin column).
 *   - first added node is an ACTION and a selected/active node exists:
 *       · selected has exactly ONE outgoing UNLABELED edge → `inserted_between` (split A→B into
 *         A→firstNew and lastNew→B; the branch/labeled case is excluded → no branch rewrite).
 *       · selected has ZERO outgoing edges → `appended` after it.
 *       · selected has multiple (or a labeled) outgoing edge → `appended` after it (additive branch;
 *         never split when ambiguous).
 *   - no selected node + exactly one chain tail → `appended` after the tail.
 *   - anything else (ambiguous multi-tail / no anchor / first node is a trigger) → `side_chain`.
 */

export type AdditivePatchPlacementKind =
  | "blank"
  | "appended"
  | "inserted_between"
  | "side_chain"
  // HERMES-AGENT-MUTATION-PREVIEW — an in-place action swap (replace_action patch), not an additive add.
  | "replaced";

/** A node to add — id already minted. `config` defaults to empty; a seeded config (guided preview
 * setup, HERMES-AGENT-GUIDED-PREVIEW-SETUP-1) is used verbatim when present. */
export interface ResolvedPatchNode {
  readonly id: string;
  readonly kind: WorkflowNode["kind"];
  readonly provider: string;
  readonly type: string;
  readonly config?: Readonly<Record<string, unknown>>;
}

/** An internal chain edge between two added nodes, already resolved to real ids (distinct, present). */
export interface ResolvedInternalEdge {
  readonly from: string;
  readonly to: string;
}

export interface ComputeAdditivePatchPlacementInput {
  readonly pendingNodes: readonly WorkflowNode[];
  readonly pendingEdges: readonly WorkflowEdge[];
  readonly toAdd: readonly ResolvedPatchNode[];
  readonly internalEdges: readonly ResolvedInternalEdge[];
  readonly appendAfterNodeId?: string;
  /** Mint a NEW edge id (the slice passes its `newEdgeId`). */
  readonly mintEdgeId: () => string;
  readonly sideChainXGap: number;
  readonly nodeYGap: number;
}

export interface AdditivePatchPlacementResult {
  readonly placement: AdditivePatchPlacementKind;
  readonly addedNodes: readonly WorkflowNode[];
  readonly addedEdges: readonly WorkflowEdge[];
  /** Existing edge ids to REMOVE — only the single split edge for `inserted_between`, else empty. */
  readonly removedEdgeIds: readonly string[];
}

export function computeAdditivePatchPlacement(
  input: ComputeAdditivePatchPlacementInput,
): AdditivePatchPlacementResult {
  const { pendingNodes, pendingEdges, toAdd, internalEdges, mintEdgeId } = input;

  // --- 1. Decide placement + anchor (+ split edge/child for inserted_between). ---
  let placement: AdditivePatchPlacementKind;
  let anchorNode: WorkflowNode | undefined;
  let splitEdge: WorkflowEdge | undefined;

  if (pendingNodes.length === 0) {
    placement = "blank";
  } else if (toAdd[0]!.kind === "action") {
    const selected = input.appendAfterNodeId
      ? pendingNodes.find((n) => n.id === input.appendAfterNodeId)
      : undefined;
    if (selected) {
      anchorNode = selected;
      const outgoing = pendingEdges.filter((e) => e.from === selected.id);
      const soleEdge = outgoing.length === 1 ? outgoing[0]! : undefined;
      // Insert-between ONLY when the sole outgoing edge is a plain (unlabeled) chain edge to a
      // distinct existing node — splitting a labeled/router branch would be a branch rewrite (excluded).
      const canSplit =
        soleEdge !== undefined &&
        soleEdge.label === undefined &&
        soleEdge.to !== selected.id &&
        pendingNodes.some((n) => n.id === soleEdge.to);
      if (canSplit) {
        placement = "inserted_between";
        splitEdge = soleEdge;
      } else {
        placement = "appended"; // zero outgoing, or multiple/labeled → additive append (no split)
      }
    } else {
      const tailId = findChainTailId(pendingNodes, pendingEdges);
      anchorNode = tailId ? pendingNodes.find((n) => n.id === tailId) : undefined;
      placement = anchorNode ? "appended" : "side_chain";
    }
  } else {
    placement = "side_chain";
  }

  // --- 2. Positions. Existing node positions are NEVER moved. ---
  const addedNodes: WorkflowNode[] = [];
  if ((placement === "appended" || placement === "inserted_between") && anchorNode) {
    // Stack the chain straight down from the anchor, each slot cleared of existing + already-added.
    let prevPos: WorkflowNodePosition = anchorNode.position;
    for (const d of toAdd) {
      const position = computeNonOverlappingPosition(prevPos, [...pendingNodes, ...addedNodes]);
      addedNodes.push({ id: d.id, kind: d.kind, provider: d.provider, type: d.type, config: { ...(d.config ?? {}) }, position });
      prevPos = position;
    }
  } else {
    const baseX =
      placement === "side_chain"
        ? Math.max(...pendingNodes.map((n) => n.position.x)) + input.sideChainXGap
        : 0;
    const baseY = placement === "side_chain" ? Math.min(...pendingNodes.map((n) => n.position.y)) : 0;
    toAdd.forEach((d, i) => {
      addedNodes.push({
        id: d.id,
        kind: d.kind,
        provider: d.provider,
        type: d.type,
        config: { ...(d.config ?? {}) },
        position: { x: baseX, y: baseY + i * input.nodeYGap },
      });
    });
  }

  // --- 3. Edges (ADD-ONLY except the one split edge). ---
  const addedEdges: WorkflowEdge[] = [];
  const removedEdgeIds: string[] = [];
  const firstNew = addedNodes[0]!;
  const lastNew = addedNodes[addedNodes.length - 1]!;

  if (placement === "inserted_between" && anchorNode && splitEdge) {
    // Replace exactly one edge A→B with A→firstNew and lastNew→B. Endpoints involving a new id can
    // never duplicate an existing edge, so this can't create an invalid/duplicate edge.
    removedEdgeIds.push(splitEdge.id);
    addedEdges.push({ id: mintEdgeId(), from: anchorNode.id, to: firstNew.id });
    addedEdges.push({ id: mintEdgeId(), from: lastNew.id, to: splitEdge.to });
  } else if (placement === "appended" && anchorNode) {
    addedEdges.push({ id: mintEdgeId(), from: anchorNode.id, to: firstNew.id });
  }

  for (const e of internalEdges) {
    addedEdges.push({ id: mintEdgeId(), from: e.from, to: e.to });
  }

  return { placement, addedNodes, addedEdges, removedEdgeIds };
}
