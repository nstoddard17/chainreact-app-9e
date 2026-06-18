import type { WorkflowDefinition } from "@/contracts/workflow";
import type { WorkflowRecord } from "@/repositories/workflows";
import { validateWorkflowPatch } from "@/services/workflows/patch/validateWorkflowPatch";
import type { PatchOperation, WorkflowPatch } from "@/services/workflows/patch/types";
import {
  assessApplyReadiness,
  type ApplyReadiness,
} from "@/services/workflows/patch/applySafety";
import { resolveFieldSensitivity } from "@/services/workflows/patch/resolveFieldSensitivity";

/**
 * AI-REPAIR-3B — DRY-RUN repair-apply readiness service.
 *
 * The backend half of a future AI-REPAIR-3 Apply, proven WITHOUT any apply: given a
 * freshly-loaded, already-authorized workflow record + a typed patch, it (1) re-runs
 * the deterministic patch validator against the FRESH definition and (2) runs the
 * AI-REPAIR-3A `assessApplyReadiness` safety contract, returning the readiness verdict.
 *
 * READINESS / DRY-RUN ONLY. It imports NO persistence, NO save, NO run, NO
 * activation path — it cannot write. It does not load (the route loads + authorizes
 * and passes the fresh `record`), so it is synchronous and side-effect-free. Authz is
 * the route's job (`loadWorkflowForMember`); this never re-authorizes or reads rows.
 *
 * No-leak: the returned `readiness` carries only operation KINDS, safe block codes,
 * and safe messages (the contract guarantees this). Raw deterministic-validation
 * errors are NOT surfaced — a failed validation collapses to the contract's safe
 * `VALIDATION_FAILED` block. `currentRevision` is the workflow's `updatedAt` (already
 * public in every workflow DTO). No config value, secret/credential key, token,
 * account role, connector id, or provider error ever appears.
 */

export interface AssessRepairApplyReadinessInput {
  /** Freshly loaded + already account-authorized record (the route did both). */
  readonly record: WorkflowRecord;
  readonly workflowId: string;
  /** Raw (untyped) operations posted by the client — classified by the contract. */
  readonly operations: unknown;
  /** The revision the patch was built against. */
  readonly baseRevision: string | null | undefined;
  /** The revision the user PREVIEWED against (defaults to `baseRevision` in the contract). */
  readonly previewRevision?: string | null | undefined;
  /** FUTURE: a recipient/destination change explicitly confirmed by the user. */
  readonly recipientChangeConfirmed?: boolean;
}

export interface RepairApplyReadiness {
  readonly readiness: ApplyReadiness;
  /** The workflow's fresh revision token (its `updatedAt`), echoed for the caller. */
  readonly currentRevision: string;
}

export function assessRepairApplyReadiness(
  input: AssessRepairApplyReadinessInput,
): RepairApplyReadiness {
  const { record, workflowId, operations, baseRevision, previewRevision, recipientChangeConfirmed } = input;

  const currentDef: WorkflowDefinition = record.draftDefinition;
  const currentRevision = record.updatedAt;
  // Only an `active` workflow has a live, registered trigger. Trigger swaps are
  // blocked regardless (the contract blocks `replaceTrigger` in both states), so
  // this only drives which block CODE is reported.
  const workflowActive = record.state === "active";

  // Assemble the envelope the deterministic validator expects. A non-array
  // `operations` (raw model text) can't be validated; the contract catches it as
  // RAW_MODEL_TEXT, so we hand the validator an empty op list there.
  const patch: WorkflowPatch = {
    patchId: `repair-apply-readiness:${workflowId}`,
    workflowId,
    baseRevision: baseRevision ?? "",
    operations: Array.isArray(operations) ? (operations as PatchOperation[]) : [],
    summary: "Apply-readiness dry run",
    rationale: "Deterministic apply-readiness assessment — no changes applied.",
  };

  // Re-validate against the FRESH definition (revision included → optimistic-concurrency
  // signal). Defensive: a malformed op shouldn't throw (the validator safe-parses), but
  // a throw collapses to "no validation metadata" → the contract blocks.
  let validationOk: boolean | null = null;
  let requiresConfirmation = false;
  try {
    const validation = validateWorkflowPatch(patch, currentDef, { currentRevision });
    validationOk = validation.ok;
    requiresConfirmation = validation.requiresConfirmation;
  } catch {
    validationOk = null;
  }

  // CS-2 — resolve declared field sensitivity from the registry BEFORE the pure
  // safety contract, so a metadata-sensitive field blocks even when its key name slips
  // the heuristics. Plain data in; the contract reads no schema itself.
  const fieldSensitivity = resolveFieldSensitivity(operations, currentDef.nodes);

  const readiness = assessApplyReadiness({
    operations,
    validation: validationOk === null ? null : { ok: validationOk, requiresConfirmation },
    baseRevision,
    ...(previewRevision !== undefined ? { previewRevision } : {}),
    currentRevision,
    workflowActive,
    currentNodeIds: currentDef.nodes.map((n) => n.id),
    ...(recipientChangeConfirmed !== undefined ? { recipientChangeConfirmed } : {}),
    fieldSensitivity,
  });

  return { readiness, currentRevision };
}
