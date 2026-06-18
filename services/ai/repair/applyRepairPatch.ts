import type { WorkflowDefinition } from "@/contracts/workflow";
import { updateDraftDefinitionIfRevisionMatches, type WorkflowRecord } from "@/repositories/workflows";
import { validateWorkflowPatch } from "@/services/workflows/patch/validateWorkflowPatch";
import type { PatchOperation, WorkflowPatch } from "@/services/workflows/patch/types";
import { assessApplyReadiness, type ApplyBlockCode } from "@/services/workflows/patch/applySafety";
import { resolveFieldSensitivity } from "@/services/workflows/patch/resolveFieldSensitivity";
import {
  executeWorkflowPatch,
  type ExecutedOperationSummary,
} from "@/services/workflows/patch/executeWorkflowPatch";

/**
 * AI-REPAIR-3D — guarded repair-patch APPLY service (the persistence boundary).
 *
 * The first AI-REPAIR slice that may WRITE a workflow draft, behind every 3A/3B/3C
 * gate. Given a freshly-loaded, already-authorized record + a typed patch it:
 *   1. re-runs the deterministic validator against the FRESH definition + revision,
 *   2. runs `assessApplyReadiness` (the safety contract),
 *   3. runs `executeWorkflowPatch` ONLY when readiness is applyable (which itself
 *      re-asserts the op gates as defense-in-depth and never mutates the input), then
 *   4. persists the executor's `updatedDefinition` via the OPTIMISTIC, account-scoped,
 *      DRAFT-ONLY repository write `updateDraftDefinitionIfRevisionMatches` — which
 *      matches on (id, account_id, expected updated_at) and returns null on a stale /
 *      changed / cross-account row (write-time concurrency guard).
 *
 * Persistence boundary — this writes the draft definition and NOTHING else. It does
 * NOT run the workflow, activate/deactivate it, register triggers, mutate
 * integrations/credentials, switch provider accounts, change billing/usage, call the
 * LLM, or emit model-call telemetry. It deliberately does NOT route through
 * `saveDraftDefinition` (whose active-trigger-change rule can deactivate a workflow):
 * a trigger change is already blocked by readiness + the executor, so the persisted
 * def can only carry config / edge / variable / move changes — there is nothing to
 * deactivate, and silent deactivation is avoided.
 *
 * No-leak: the result carries only safe block codes, the new revision token, and the
 * value-free `appliedOperations` summary (op kinds + graph ids + non-secret field
 * keys). It NEVER returns the `updatedDefinition`, a config value, a secret/credential
 * key, an account role, a connector id, or a raw provider/DB error.
 */

export type ApplyRepairPatchFailureCode = "NOT_APPLYABLE" | "EXECUTION_FAILED" | "STALE_PATCH";

export type ApplyRepairPatchResult =
  | {
      readonly ok: true;
      /** The workflow's NEW revision token after the write. */
      readonly currentRevision: string;
      readonly appliedOperations: readonly ExecutedOperationSummary[];
    }
  | {
      readonly ok: false;
      readonly code: ApplyRepairPatchFailureCode;
      readonly message: string;
      /** Present for NOT_APPLYABLE — the safe readiness block codes. */
      readonly blockedCategories?: readonly ApplyBlockCode[];
    };

export interface ApplyRepairPatchInput {
  /** Freshly loaded + already account-authorized + edit-authorized record. */
  readonly record: WorkflowRecord;
  readonly workflowId: string;
  /** Raw (untyped) operations from the client — classified by the contract/executor. */
  readonly operations: unknown;
  readonly baseRevision: string | null | undefined;
  readonly previewRevision?: string | null | undefined;
  readonly recipientChangeConfirmed?: boolean;
}

export async function applyRepairPatch(
  input: ApplyRepairPatchInput,
): Promise<ApplyRepairPatchResult> {
  const { record, workflowId, operations, baseRevision, previewRevision, recipientChangeConfirmed } = input;

  const currentDef: WorkflowDefinition = record.draftDefinition;
  const currentRevision = record.updatedAt;
  const workflowActive = record.state === "active";

  const typedOps: PatchOperation[] = Array.isArray(operations) ? (operations as PatchOperation[]) : [];
  const patch: WorkflowPatch = {
    patchId: `repair-apply:${workflowId}`,
    workflowId,
    baseRevision: baseRevision ?? "",
    operations: typedOps,
    summary: "AI repair apply",
    rationale: "Applying a previewed, validated repair patch.",
  };

  // 1. Re-validate against the FRESH definition (revision → optimistic signal).
  let validationOk: boolean | null = null;
  let requiresConfirmation = false;
  try {
    const validation = validateWorkflowPatch(patch, currentDef, { currentRevision });
    validationOk = validation.ok;
    requiresConfirmation = validation.requiresConfirmation;
  } catch {
    validationOk = null;
  }

  // CS-2 — resolve declared field sensitivity once; thread it into BOTH the readiness
  // contract and the in-memory executor's defense-in-depth re-check.
  const fieldSensitivity = resolveFieldSensitivity(operations, currentDef.nodes);

  // 2. Readiness contract.
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

  // 3. Gate — nothing is executed or persisted unless applyable.
  if (!readiness.applyable) {
    const stale =
      readiness.blockedCategories.includes("STALE_PREVIEW") ||
      readiness.blockedCategories.includes("GRAPH_CHANGED_SINCE_PREVIEW");
    return stale
      ? { ok: false, code: "STALE_PATCH", message: "This preview is out of date. Re-check the workflow and try again." }
      : { ok: false, code: "NOT_APPLYABLE", message: "This change can't be applied.", blockedCategories: readiness.blockedCategories };
  }

  // 4. Execute IN MEMORY (re-asserts op safety; never mutates the input def).
  const executed = executeWorkflowPatch(
    currentDef,
    typedOps,
    readiness,
    {
      ...(recipientChangeConfirmed !== undefined ? { recipientChangeConfirmed } : {}),
      fieldSensitivity,
    },
  );
  if (!executed.ok) {
    return { ok: false, code: "EXECUTION_FAILED", message: "This change couldn't be applied to the workflow." };
  }

  // 5. Persist the DRAFT ONLY, optimistically (account-scoped; null = changed/stale).
  let updated: WorkflowRecord | null;
  try {
    updated = await updateDraftDefinitionIfRevisionMatches({
      accountId: record.accountId,
      workflowId,
      draftDefinition: executed.updatedDefinition,
      expectedUpdatedAt: currentRevision,
    });
  } catch {
    // No-leak: a raw repo/Postgres error can name tables/columns — collapse it.
    return { ok: false, code: "EXECUTION_FAILED", message: "Couldn't save the change. Please try again." };
  }
  if (!updated) {
    return { ok: false, code: "STALE_PATCH", message: "The workflow changed while applying. Re-check the workflow and try again." };
  }

  return { ok: true, currentRevision: updated.updatedAt, appliedOperations: executed.appliedOperations };
}
