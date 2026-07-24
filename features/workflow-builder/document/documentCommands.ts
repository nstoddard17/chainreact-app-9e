import type { ActionMeta } from "@/contracts/actionMeta";
import {
  isAdvancedBranchingNode,
  isAdvancedBranchingTypeKey,
} from "@/core/workflows/advancedBranching";
import { returnableBranchLabels } from "@/core/workflows/branchWiring";
import { commitNodeConfigDraft } from "../state/commitConfigDraft";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";

/**
 * 5.DUAL-BUILDER-1 CS-2 — the Document command boundary.
 *
 * Thin, typed compositions over the EXISTING graphSlice/configSlice actions —
 * never a parallel store, never a second save/validation path. Every command
 * returns a typed result (no raw throws into components) and guards against a
 * stale DocumentModel: the caller passes the ids it rendered, and the command
 * re-verifies them against the CURRENT store before delegating. Ambiguity is
 * a refusal, never a guess.
 */

export type DocumentCommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: DocumentCommandRefusal };

export type DocumentCommandRefusal =
  | "node_missing"
  | "edge_missing"
  | "no_draft"
  | "stale_document_model"
  | "ambiguous_insertion"
  | "branching_not_supported_in_cs2"
  | "unsupported_region"
  // 5.DUAL-BUILDER-1 CS-2B — branch-lane insertion refusals.
  | "stale_branch_label"
  | "invalid_branch_source";

const ok: DocumentCommandResult = { ok: true };
const refuse = (reason: DocumentCommandRefusal): DocumentCommandResult => ({ ok: false, reason });

/**
 * Commit the node's shared configSlice draft into the graph — EXACTLY the
 * inspector's Save-in-panel path (`commitNodeConfigDraft` →
 * `graphSlice.updateNodeConfig` + `configSlice.markSaved`). Local only; the
 * workflow Save button remains the sole persistence control.
 */
export function commitDocumentField(input: { nodeId: string }): DocumentCommandResult {
  const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === input.nodeId);
  if (!node) return refuse("node_missing");
  if (!commitNodeConfigDraft(input.nodeId)) return refuse("no_draft");
  return ok;
}

/**
 * Abandon a Guided Stop's uncommitted input: restore the shared draft to the
 * snapshot captured when the stop opened. Graph untouched.
 */
export function cancelDocumentField(input: {
  nodeId: string;
  snapshotValues: Readonly<Record<string, unknown>>;
}): DocumentCommandResult {
  const config = useConfigSlice.getState();
  if (!config.drafts[input.nodeId]) return refuse("no_draft");
  config.restoreDraftValues({ nodeId: input.nodeId, values: input.snapshotValues });
  return ok;
}

/**
 * Validate a Document "add at end" anchor against the CURRENT graph: the
 * node must still exist and still be a true linear tail (zero outgoing
 * edges). Refusal = the model the user clicked in is stale or the location
 * is ambiguous — never guess.
 */
export function validateDocumentTailAdd(input: { anchorNodeId: string }): DocumentCommandResult {
  const { pendingNodes, pendingEdges } = useGraphSlice.getState();
  const node = pendingNodes.find((n) => n.id === input.anchorNodeId);
  if (!node) return refuse("node_missing");
  const outgoing = pendingEdges.filter((e) => e.from === input.anchorNodeId);
  if (outgoing.length > 0) return refuse("stale_document_model");
  return ok;
}

/**
 * Validate a Document "insert between" edge against the CURRENT graph: the
 * edge must still exist, still connect the endpoints the Document rendered,
 * still be unlabeled (labeled = branch-lane entry → Visual Builder job in
 * CS-2), and its source must still have exactly one outgoing edge.
 */
export function validateDocumentEdgeInsertion(input: {
  edgeId: string;
  expectedFrom: string;
  expectedTo: string;
}): DocumentCommandResult {
  const { pendingEdges } = useGraphSlice.getState();
  const edge = pendingEdges.find((e) => e.id === input.edgeId);
  if (!edge) return refuse("edge_missing");
  if (edge.from !== input.expectedFrom || edge.to !== input.expectedTo) {
    return refuse("stale_document_model");
  }
  if (edge.label !== undefined) return refuse("unsupported_region");
  const siblings = pendingEdges.filter((e) => e.from === edge.from);
  if (siblings.length !== 1) return refuse("ambiguous_insertion");
  return ok;
}

/**
 * CS-2 branch-authoring boundary: picking If/Then or Router from the
 * Document's shared picker is refused (typed) — the Visual Builder owns
 * branch creation until the Document branch-authoring slice. Never partially
 * creates an unconfigured branch node.
 */
export function guardDocumentActionMeta(meta: Pick<ActionMeta, "key">): DocumentCommandResult {
  if (isAdvancedBranchingTypeKey(meta.key)) return refuse("branching_not_supported_in_cs2");
  return ok;
}

/**
 * Step-level configuration handoff: open the node in the EXISTING inspector
 * flow (configSlice.openNode → WorkflowBuilder's drawer transition), reusing
 * any in-progress shared draft. Navigation only.
 */
export function openDocumentStepConfig(input: { nodeId: string }): DocumentCommandResult {
  const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === input.nodeId);
  if (!node) return refuse("node_missing");
  useConfigSlice.getState().openNode({ nodeId: input.nodeId, initialValues: node.config ?? {} });
  return ok;
}

/**
 * 5.DUAL-BUILDER-1 CS-2B — validate inserting an ordinary action at the START
 * of a branch lane: `branch --[LABEL]--> B` becomes
 * `branch --[LABEL]--> NEW --> B`.
 *
 * Every check runs against LIVE `pendingNodes`/`pendingEdges` immediately
 * before the caller mutates, so a stale DocumentModel can never redirect the
 * insertion onto a different or deleted edge. This validates ONLY; the actual
 * rewiring stays in the shared `insertActionAtEdge` (which already keeps the
 * route label on the upstream half and leaves the continuation unlabeled) —
 * there is no Document-only rewiring implementation.
 *
 * NOT branch authoring: no lane is created, removed, relabeled, or reordered,
 * and the node's returnable vocabulary is untouched, so the fork's runtime
 * meaning (activation, skips, rejoin, terminal paths) is unchanged.
 */
export function validateDocumentBranchLaneInsertion(input: {
  edgeId: string;
  expectedFrom: string;
  expectedTo: string;
  expectedLabel: string;
}): DocumentCommandResult {
  const { pendingNodes, pendingEdges } = useGraphSlice.getState();

  const edge = pendingEdges.find((e) => e.id === input.edgeId);
  if (!edge) return refuse("edge_missing");
  // The rendered lane must still be THIS edge, end to end.
  if (edge.from !== input.expectedFrom || edge.to !== input.expectedTo) {
    return refuse("stale_document_model");
  }
  if (edge.label === undefined) return refuse("unsupported_region");
  if (edge.label !== input.expectedLabel) return refuse("stale_document_model");

  const source = pendingNodes.find((n) => n.id === edge.from);
  if (!source) return refuse("node_missing");
  const target = pendingNodes.find((n) => n.id === edge.to);
  if (!target) return refuse("node_missing");

  // Only a recognized native If/Then or Router node owns labeled routes the
  // Document understands. A labeled edge from anything else is the
  // `labeled_edge_non_branching` shape — Visual Builder territory.
  if (!isAdvancedBranchingNode(source)) return refuse("invalid_branch_source");

  // The label must still be RETURNABLE by the node's current config; a stale
  // route is a dead path that CS-2 renders as a warning and CS-2B refuses to
  // build on (repairing stale wiring is explicitly out of scope).
  const vocabulary = returnableBranchLabels(source);
  if (vocabulary === null) return refuse("invalid_branch_source");
  if (!vocabulary.includes(edge.label)) return refuse("stale_branch_label");

  // One unambiguous lane destination: exactly one edge carries this label.
  const sameLabel = pendingEdges.filter(
    (e) => e.from === edge.from && e.label === edge.label,
  );
  if (sameLabel.length !== 1) return refuse("ambiguous_insertion");

  // Post-insert safety, mirroring connectNodes' own guards so the shared
  // helper can never half-mutate: the continuation `NEW -> target` is a fresh
  // node id, so it can only collide if the target IS the source (self-loop).
  if (edge.from === edge.to) return refuse("unsupported_region");

  return ok;
}

/** Plain-language copy for a typed refusal (never a raw error in the UI). */
export function describeDocumentRefusal(reason: DocumentCommandRefusal): string {
  switch (reason) {
    case "node_missing":
      return "That step isn't here anymore — it may have been removed.";
    case "edge_missing":
      return "That connection isn't here anymore.";
    case "no_draft":
      return "There was nothing to save for that step.";
    case "stale_document_model":
      return "This part of the workflow changed — take another look and try again.";
    case "ambiguous_insertion":
      return "There's more than one path here, so it's not clear where the step should go. Add it on the canvas.";
    case "branching_not_supported_in_cs2":
      return "Splits are added on the canvas for now. Open the Visual Builder to add this one.";
    case "unsupported_region":
      return "This branch shape is easier to edit in the Visual Builder.";
    case "stale_branch_label":
      return "This route no longer exists on the branch. Review the workflow and try again.";
    case "invalid_branch_source":
      return "This connection isn't a branch route the Document can add to. Open the Visual Builder.";
  }
}
