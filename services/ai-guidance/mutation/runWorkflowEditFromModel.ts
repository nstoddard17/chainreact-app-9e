/**
 * MODEL patch → validated, stale-checked, locally-applicable proposal (HERMES-AGENT-WORKFLOW-EDITOR-LIVE).
 *
 * The single orchestrator the route calls for a MODEL-proposed edit (the demoted deterministic fallback
 * keeps its own real-id path — it never goes through here). It threads the whole live path's server half:
 *
 *   editable graph (refs + version + private refMap)  +  model operations (opaque refs)  +  echoed version
 *     → STALE GUARD: reject if the live draft version drifted from the one the graph was built against
 *       (or from the version the model echoed) — never apply a patch to a different graph version
 *     → resolveEditableGraphRefs  (opaque refs → real ids; reject unknown/stale/real-id refs)
 *     → proposeWorkflowMutation   (materialize new ids → validateWorkflowPatch(localDraft) → candidate)
 *     → { proposal | invalid | stale | noop }  (+ the baseGraphVersion the proposal is pinned to)
 *
 * Pure + model-free + no I/O. The `baseGraphVersion` rides back to the client so Apply can re-check the
 * live draft one more time before replacing it (defense against a change between proposal and Apply).
 */

import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { PatchOperation } from "@/services/workflows/patch/types";
import type { MaterializeAiPatchNodeIdsOptions } from "@/services/ai/patch/materializeAiPatchNodeIds";
import { computeEditableGraphVersion } from "@/core/workflows/editableGraphVersion";
import type { BuiltEditableWorkflowGraph } from "../editableGraph/buildEditableWorkflowGraph";
import { resolveEditableGraphRefs } from "./resolveEditableGraphRefs";
import { proposeWorkflowMutation, type ProposeWorkflowMutationResult } from "./proposeWorkflowMutation";

/** Safe, user-facing copy for a stale proposal (the draft changed while React was responding). */
export const STALE_EDIT_MESSAGE =
  "Your workflow changed while I was working on that. Ask me again and I'll propose the edit against the latest version of your canvas.";

export interface RunWorkflowEditFromModelInput {
  /** The user's CURRENT local draft (the latest snapshot the route received). */
  readonly currentDraft: WorkflowDefinition;
  /** The editable graph the model was given (carries the private refMap + the snapshot version). */
  readonly editableGraph: BuiltEditableWorkflowGraph;
  /** The model's proposed operations (opaque refs). */
  readonly operations: readonly PatchOperation[];
  /** The editable-graph version the model echoed back, if any (extra stale signal). */
  readonly modelBaseVersion?: string;
}

export type RunWorkflowEditFromModelResult =
  | (Extract<ProposeWorkflowMutationResult, { kind: "proposal" }> & { readonly baseGraphVersion: string })
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "stale"; readonly message: string }
  | { readonly kind: "noop" };

export function runWorkflowEditFromModel(
  input: RunWorkflowEditFromModelInput,
  options: MaterializeAiPatchNodeIdsOptions = {},
): RunWorkflowEditFromModelResult {
  if (!input.operations || input.operations.length === 0) return { kind: "noop" };

  // STALE GUARD — the live draft version must match BOTH the snapshot the graph was built from and the
  // version the model echoed. Any drift → reject as stale; never validate/apply against a changed graph.
  const currentVersion = computeEditableGraphVersion(input.currentDraft);
  const snapshotDrifted = input.editableGraph.version !== currentVersion;
  const echoDrifted = input.modelBaseVersion !== undefined && input.modelBaseVersion !== currentVersion;
  if (snapshotDrifted || echoDrifted) {
    return { kind: "stale", message: STALE_EDIT_MESSAGE };
  }

  // Opaque refs → real ids. Unknown / stale / real-id refs are rejected here (no silent guess).
  const resolved = resolveEditableGraphRefs(input.operations, input.editableGraph.refMap, input.editableGraph.edgeRefMap);
  if (!resolved.ok) return { kind: "invalid", message: resolved.message };

  const proposal = proposeWorkflowMutation({ currentDraft: input.currentDraft, operations: resolved.operations }, options);
  if (proposal.kind === "proposal") return { ...proposal, baseGraphVersion: currentVersion };
  return proposal;
}
