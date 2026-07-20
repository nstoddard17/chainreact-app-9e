/**
 * General conversational workflow-mutation proposal (HERMES-AGENT-WORKFLOW-EDITOR).
 *
 * The React Agent acts as a conversational editor: given the user's CURRENT LOCAL draft and a set of
 * proposed `WorkflowPatch` operations (from the model, or a demoted deterministic fallback), this turns
 * them into a validated, previewable, locally-applicable proposal — reusing the EXISTING general patch
 * engine (no new operation set, no phrase matching):
 *
 *   model/fallback operations (stable node refs)
 *     → materializeAiPatchNodeIds   (assign system ids to NEW nodes; reject unknown refs — never guess)
 *     → validateWorkflowPatch       (atomic apply onto the LOCAL draft; catalog-validate every node/
 *                                    edge/config field; produce the exact candidate end-state)
 *     → { proposedDefinition, previewDraft, plan }   (the canvas auto-shows it; Apply replaces the
 *                                                     local draft with the candidate; Discard = nothing)
 *
 * Atomic: validateWorkflowPatch applies ALL operations or NONE — a partially-valid proposal never
 * previews. Missing ORDINARY config becomes "needs setup" in the preview (NON-blocking); only catalog /
 * structural / unknown-reference failures block, with an exact, actionable, secret-free reason.
 *
 * Pure + model-free + no I/O. Secrets never appear (the candidate's config is the user's own draft; the
 * preview/plan carry labels + field KEY names only).
 */

import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import { materializeAiPatchNodeIds, type MaterializeAiPatchNodeIdsOptions } from "@/services/ai/patch/materializeAiPatchNodeIds";
import { validateWorkflowPatch } from "@/services/workflows/patch/validateWorkflowPatch";
import type { PatchOperation, PatchValidationError, PatchWarningCode } from "@/services/workflows/patch/types";
import { definitionToDraftPreview, definitionToPlan } from "../preview/definitionToDraftPreview";
import { describeProposedEditChange } from "./summarizeProposedEdit";

/** Capitalize the first letter so a clause reads as a sentence ("replace ..." → "Replace ..."). */
function capitalizeFirst(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Codes that are NON-blocking for a PREVIEW — missing ordinary config becomes "needs setup", not a fail. */
const NON_BLOCKING_CODES: ReadonlySet<PatchValidationError["code"]> = new Set(["MISSING_REQUIRED_FIELD"]);

/**
 * Warning codes safe to surface to the USER. The structural patch warnings
 * (DELETES_USER_WORK / ORPHANS_DOWNSTREAM / UNKNOWN_CONFIG_FIELD / SUSPICIOUS_BRANCH_LABEL) embed raw
 * node/edge ids and internal patch wording ("Node '<uuid>' and its edges are removed."), and a removal
 * is already explained by the human `summary` — so they NEVER reach the rail. Only human-safe, id-free
 * notes pass through: cost, and the branch-wiring warnings (RECONV-1 S3 —
 * MISSING_BRANCH_EDGE / STALE_BRANCH_EDGE). The latter are ACTIONABLE "your route is disconnected /
 * dead" signals whose messages are built from friendly step names (never raw uuids or config values),
 * and hiding them would let a half-wired branch proposal look clean until activate/publish fails.
 * Risk classification itself is unchanged; this only filters DISPLAY copy.
 */
const USER_SAFE_WARNING_CODES: ReadonlySet<PatchWarningCode> = new Set([
  "COST_WARNING",
  "MISSING_BRANCH_EDGE",
  "STALE_BRANCH_EDGE",
]);

export interface ProposeWorkflowMutationInput {
  /** The user's CURRENT local draft (the unsaved canvas) — the diff base + validation target. */
  readonly currentDraft: WorkflowDefinition;
  /** Proposed operations with stable refs to current-draft node ids (+ patch-local ids for new nodes). */
  readonly operations: readonly PatchOperation[];
  /** Optional human one-liner for the proposal. */
  readonly summary?: string;
}

export type ProposeWorkflowMutationResult =
  | {
      readonly kind: "proposal";
      /** The exact validated end-state graph — Apply replaces the local draft with THIS. */
      readonly proposedDefinition: WorkflowDefinition;
      readonly previewDraft: DraftPreview;
      /** Lightweight plan mirroring the candidate — only so the existing auto-show guard works. */
      readonly workflowPlan: WorkflowPlan;
      readonly summary: string;
      /** Safe, non-blocking notes (e.g. cost / deletes-user-work warnings). */
      readonly warnings: readonly string[];
    }
  /** Blocking: an exact, actionable reason (unsupported capability, invalid edge, unknown step, …). */
  | { readonly kind: "invalid"; readonly message: string }
  /** Nothing to propose (no operations). */
  | { readonly kind: "noop" };

/** First blocking error → an exact, actionable, secret-free message (PatchValidationError messages are safe). */
function firstBlockingMessage(errors: readonly PatchValidationError[]): string | null {
  const blocking = errors.find((e) => !NON_BLOCKING_CODES.has(e.code));
  return blocking ? blocking.message : null;
}

export function proposeWorkflowMutation(
  input: ProposeWorkflowMutationInput,
  options: MaterializeAiPatchNodeIdsOptions = {},
): ProposeWorkflowMutationResult {
  if (!input.operations || input.operations.length === 0) return { kind: "noop" };

  // Wrap the operations in a local-draft envelope. baseRevision is a non-empty sentinel (no optimistic-
  // concurrency check for the LOCAL canvas) — the user explicitly Applies, and Apply re-targets the live
  // local draft. patchId/rationale are non-rendered envelope fields.
  const envelope = {
    patchId: "local-mutation",
    workflowId: null,
    baseRevision: "local-draft",
    operations: [...input.operations],
    summary: input.summary ?? "Proposed workflow change",
    rationale: "",
  };

  // Assign system ids to NEW nodes + reject unknown node refs (no silent "the only Slack node" guess).
  const materialized = materializeAiPatchNodeIds(envelope, input.currentDraft, options);
  if (!materialized.ok) {
    return { kind: "invalid", message: materialized.errors[0]?.message ?? "I couldn't make that change as described." };
  }

  // Atomic apply onto the LOCAL draft + full catalog/structure validation → exact candidate end-state.
  const result = validateWorkflowPatch(materialized.patch, input.currentDraft);
  if (!result.candidateDefinition) {
    // The operations couldn't be applied structurally at all (e.g. references a step that isn't there).
    return { kind: "invalid", message: firstBlockingMessage(result.errors) ?? "I couldn't make that change as described." };
  }
  const blocking = firstBlockingMessage(result.errors);
  if (blocking) {
    return { kind: "invalid", message: blocking };
  }

  const candidate = result.candidateDefinition;
  // HUMAN summary for the rail/preview — never the machine op counts ("removeNode×1, addNode×1").
  // `describeProposedEditChange` diffs the draft vs the candidate into a plain clause; the validator's
  // `previewSummary` (op counts) is kept only as a last-resort fallback (e.g. no diff describable).
  const summary = input.summary ?? capitalizeFirst(describeProposedEditChange(input.currentDraft, candidate));
  const title = "Proposed change";
  return {
    kind: "proposal",
    proposedDefinition: candidate,
    previewDraft: definitionToDraftPreview(candidate, title, summary),
    workflowPlan: definitionToPlan(candidate, title, summary),
    summary,
    // Only human-safe, id-free warnings reach the UI (the removal is already conveyed by `summary`).
    warnings: result.warnings.filter((w) => USER_SAFE_WARNING_CODES.has(w.code)).map((w) => w.message),
  };
}
