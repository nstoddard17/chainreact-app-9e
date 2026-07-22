import { isAdvancedBranchingNode } from "@/core/workflows/advancedBranching";
import { useGraphSlice } from "../state/graphSlice";

/**
 * 5.DUAL-BUILDER-1 CS-6 — the Document SELECTION command boundary.
 *
 * Typed, NON-THROWING compositions over the EXISTING canonical graphSlice
 * actions (addActionAfter / connectNodes / removeEdge / deleteNodeAndRewire /
 * createSection / swapAdjacentLinearActions) for the multi-select toolbar:
 * wrap-in-section, duplicate, delete, and limited adjacent-linear move. Every
 * command re-reads LIVE store state, refuses unsafe/ambiguous gestures with a
 * typed reason (never a raw throw into a component), never partially mutates
 * after a refusal, and participates in the SHARED undo/redo + dirty state — no
 * second selection model, save path, or topology system.
 */

export type DocumentSelectionResult =
  | { readonly ok: true; readonly nodeId?: string }
  | { readonly ok: false; readonly reason: DocumentSelectionRefusal };

export type DocumentSelectionRefusal =
  | "node_missing"
  | "cannot_duplicate_trigger"
  | "unsupported_fork_duplication"
  | "ambiguous_location"
  | "destructive_confirmation_required"
  | "unsupported_region"
  | "cannot_move_trigger"
  | "no_move_target"
  | "not_top_level"
  | "noncontiguous"
  | "empty_selection";

const refuse = (reason: DocumentSelectionRefusal): DocumentSelectionResult => ({ ok: false, reason });

/**
 * CS-6 — duplicate an ORDINARY linear action. Copies provider/type/config to a
 * NEW canonical id at a non-overlapping position and inserts the copy right
 * after the original on its unambiguous linear path (tail → append; single
 * unlabeled continuation → between). Refuses a trigger, a branching node (no
 * canonical fork-duplication command exists), and any ambiguous location.
 * Node `config` never carries secret/connection credentials (those resolve at
 * runtime), so the copy leaks nothing.
 */
export function duplicateDocumentAction(input: { nodeId: string }): DocumentSelectionResult {
  const { pendingNodes, pendingEdges } = useGraphSlice.getState();
  const node = pendingNodes.find((n) => n.id === input.nodeId);
  if (!node) return refuse("node_missing");
  if (node.kind === "trigger") return refuse("cannot_duplicate_trigger");
  if (isAdvancedBranchingNode(node)) return refuse("unsupported_fork_duplication");

  const outgoing = pendingEdges.filter((e) => e.from === input.nodeId);
  const labeledOut = outgoing.filter((e) => e.label !== undefined);
  if (labeledOut.length > 0) return refuse("ambiguous_location");
  if (outgoing.length > 1) return refuse("ambiguous_location");

  const configCopy = { ...(node.config ?? {}) };
  // addActionAfter creates `node -> dup` (unlabeled) at a non-overlapping slot.
  const dup = useGraphSlice
    .getState()
    .addActionAfter(input.nodeId, { provider: node.provider, type: node.type, config: configCopy });

  // Mid-chain: rewire `node -> dup -> B` so the copy lands between, not fanning out.
  const continuation = outgoing[0];
  if (continuation) {
    try {
      useGraphSlice.getState().removeEdge(continuation.id);
      useGraphSlice.getState().connectNodes({ from: dup.id, to: continuation.to });
    } catch {
      // Fresh (dup, B) can't collide; never half-wire.
    }
  }
  return { ok: true, nodeId: dup.id };
}

/**
 * CS-6 — delete a top-level block through the CANONICAL `deleteNodeAndRewire`.
 * A branch (fork) node is refused to the Visual Builder — there is no
 * confirmed-safe subtree-delete command, and CS-6 never recursively deletes a
 * lane subtree. Deleting a node that removes executable topology (a trigger, or
 * any node with a downstream continuation) requires `confirmed`. A multi-edge
 * node the rewire can't resolve is a Visual-Builder job.
 */
export function removeDocumentBlock(input: {
  nodeId: string;
  confirmed?: boolean;
}): DocumentSelectionResult {
  const { pendingNodes, pendingEdges } = useGraphSlice.getState();
  const node = pendingNodes.find((n) => n.id === input.nodeId);
  if (!node) return refuse("node_missing");
  if (isAdvancedBranchingNode(node)) return refuse("unsupported_region");

  const affectsTopology = node.kind === "trigger" || pendingEdges.some((e) => e.from === input.nodeId);
  if (affectsTopology && input.confirmed !== true) return refuse("destructive_confirmation_required");

  const outcome = useGraphSlice.getState().deleteNodeAndRewire(input.nodeId);
  if (!outcome.ok) {
    return refuse(outcome.reason === "unknown_node" ? "node_missing" : "unsupported_region");
  }
  return { ok: true };
}

/**
 * CS-6 — move a top-level linear action one position earlier/later on its ONE
 * unambiguous linear path, delegating to the atomic
 * `graphSlice.swapAdjacentLinearActions` transaction (single history entry).
 * Refuses a trigger, a fork/rejoin/lane boundary, and any ambiguous topology.
 */
export function moveDocumentAction(input: {
  nodeId: string;
  direction: "earlier" | "later";
}): DocumentSelectionResult {
  const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === input.nodeId);
  if (!node) return refuse("node_missing");
  if (node.kind === "trigger") return refuse("cannot_move_trigger");
  const result = useGraphSlice.getState().swapAdjacentLinearActions(input.nodeId, input.direction);
  if (result.ok) return { ok: true };
  switch (result.reason) {
    case "node_missing":
      return refuse("node_missing");
    case "no_target":
      return refuse("no_move_target");
    case "not_linear":
      return refuse("unsupported_region");
  }
}

/** Plain-language copy for a refused selection action (never a raw error). */
export function describeSelectionRefusal(reason: DocumentSelectionRefusal): string {
  switch (reason) {
    case "node_missing":
      return "That step isn't here anymore — it may have been removed.";
    case "cannot_duplicate_trigger":
      return "A workflow can only have one trigger, so it can't be duplicated.";
    case "unsupported_fork_duplication":
      return "Duplicating a whole branch is easier on the Visual Builder.";
    case "ambiguous_location":
      return "There's more than one path here, so it's not clear where the copy should go. Use the Visual Builder.";
    case "destructive_confirmation_required":
      return "This will remove steps from your workflow. Confirm to delete.";
    case "unsupported_region":
      return "This part is easier to change on the Visual Builder.";
    case "cannot_move_trigger":
      return "The trigger always comes first — it can't be moved.";
    case "no_move_target":
      return "There's no step to swap with in that direction.";
    case "not_top_level":
      return "Steps inside a branch can't be grouped on their own — group the whole split.";
    case "noncontiguous":
      return "Only steps next to each other can go in one section.";
    case "empty_selection":
      return "Pick at least one step first.";
  }
}
