/**
 * Confirmed WorkflowPatch apply service (Slice 4.AI-6).
 *
 * The first AI slice that may mutate a saved workflow. Strict by construction:
 *   1. Load the workflow by id; enforce ownership (missing/not-owned → NOT_FOUND).
 *   2. Use the UNREDACTED `draftDefinition` straight from the repository — NEVER
 *      a client-supplied or AI-5 redacted preview candidate.
 *   3. Re-run the AI-3 deterministic validator at apply time.
 *   4. Reject invalid patches (nothing is persisted).
 *   5. Optimistic concurrency: reject when `baseRevision` != the workflow's
 *      current revision token (`updatedAt`).
 *   6. Require explicit confirmation when validation says so — confirmation can
 *      never bypass validation, and a mismatched accepted-risk re-prompts.
 *   7. Persist the validator's candidate via the EXISTING repo update method.
 *
 * No model calls, no agent loop, no UI, no auto-apply, no billing deduction.
 *
 * Concurrency note: the workflows repo has no content-revision column, so
 * `updatedAt` is the optimistic-lock token. Apply checks it at READ time
 * (compare `baseRevision` to `updatedAt`) AND at WRITE time via
 * `updateDraftDefinitionIfRevisionMatches` (`.eq("updated_at", …)`, mirroring
 * `applyTransition`) — a workflow that changed after our read is never
 * overwritten; apply returns STALE_PATCH instead (hardened in Slice 4.AI-6B).
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §6/§8.
 */

import type { WorkflowDefinition } from "@/contracts/workflow";
import { isSecretKey } from "@/services/ai/tools/redact";
import {
  getById,
  updateDraftDefinitionIfRevisionMatches,
  type WorkflowRecord,
} from "@/repositories/workflows";
import { validateWorkflowPatch } from "@/services/workflows/patch/validateWorkflowPatch";
import type {
  PatchOperation,
  PatchValidationError,
} from "@/services/workflows/patch/types";
import type {
  ApplyErrorCode,
  ApplyWorkflowPatchFailure,
  ApplyWorkflowPatchInput,
  ApplyWorkflowPatchResult,
} from "./types";

function fail(
  code: ApplyErrorCode,
  message: string,
  errors?: readonly PatchValidationError[],
): ApplyWorkflowPatchFailure {
  return { ok: false, code, message, ...(errors ? { errors } : {}) };
}

/** Secret-shaped config KEY names anywhere in the patch (for message scrubbing). */
function collectSecretConfigKeys(operations: readonly PatchOperation[]): string[] {
  const keys = new Set<string>();
  for (const op of operations) {
    const config =
      op.op === "addNode" || op.op === "replaceTrigger"
        ? op.node.config
        : op.op === "updateNodeConfig"
          ? op.config
          : null;
    if (config) for (const k of Object.keys(config)) if (isSecretKey(k)) keys.add(k);
  }
  return [...keys];
}

function scrubError(
  e: PatchValidationError,
  secretKeys: readonly string[],
): PatchValidationError {
  let message = e.message;
  for (const k of secretKeys) message = message.split(k).join("[sensitive field]");
  return {
    ...e,
    message,
    ...(e.path !== undefined ? { path: isSecretKey(e.path) ? "[sensitive field]" : e.path } : {}),
  };
}

/** Choose a single typed code for a validation failure. */
function classifyValidationFailure(errors: readonly PatchValidationError[]): ApplyErrorCode {
  const codes = new Set(errors.map((e) => e.code));
  if (codes.has("UNSUPPORTED_OPERATION")) return "UNSUPPORTED_OPERATION";
  if (codes.has("INVALID_PATCH") || codes.has("BASE_REVISION_MISSING")) return "PATCH_INVALID";
  return "VALIDATION_FAILED";
}

function collectAffectedEdgeIds(operations: readonly PatchOperation[]): string[] {
  const ids = new Set<string>();
  for (const op of operations) {
    if (op.op === "addEdge") ids.add(op.edge.id);
    else if (op.op === "removeEdge") ids.add(op.edgeId);
    else if (op.op === "replaceEdge") {
      ids.add(op.edgeId);
      ids.add(op.edge.id);
    }
  }
  return [...ids];
}

export async function applyWorkflowPatchForAI(
  input: ApplyWorkflowPatchInput,
): Promise<ApplyWorkflowPatchResult> {
  const { userId, workflowId, patch, confirmation } = input;

  // 1 + 2. Load the UNREDACTED definition; enforce ownership.
  let record: WorkflowRecord | null;
  try {
    record = await getById(workflowId);
  } catch {
    return fail("UPDATE_FAILED", "Couldn't load the workflow.");
  }
  if (!record || record.userId !== userId) {
    return fail("NOT_FOUND", `No workflow '${workflowId}'.`);
  }
  const currentDef: WorkflowDefinition = record.draftDefinition;
  const operations = patch.operations ?? [];
  const secretKeys = collectSecretConfigKeys(operations);

  // 3 + 4. Re-validate against the current definition. Nothing is persisted
  //         when validation fails.
  const validation = validateWorkflowPatch(patch, currentDef);
  if (!validation.ok) {
    const safeErrors = validation.errors.map((e) => scrubError(e, secretKeys));
    const code = classifyValidationFailure(validation.errors);
    return fail(code, `Patch failed validation (${safeErrors.length} error(s)).`, safeErrors);
  }
  const candidate = validation.candidateDefinition;
  if (!candidate) {
    // Defensive: validation.ok implies a candidate, but never persist without one.
    return fail("VALIDATION_FAILED", "No candidate definition was produced.");
  }

  // 5. Optimistic concurrency (read-time): the patch must be based on the
  //    workflow's current revision token (its updatedAt).
  if (patch.baseRevision !== record.updatedAt) {
    return fail(
      "STALE_PATCH",
      "Patch was computed against an older version of this workflow. Re-preview against the latest and try again.",
    );
  }

  // 6. Confirmation gate — confirmation can never bypass validation, and a
  //    mismatched accepted risk level re-prompts.
  if (validation.requiresConfirmation) {
    const confirmed = confirmation?.confirmed === true;
    const riskMatches =
      confirmation?.acceptedRiskLevel === undefined ||
      confirmation.acceptedRiskLevel === validation.riskLevel;
    if (!confirmed || !riskMatches) {
      return fail(
        "CONFIRMATION_REQUIRED",
        `This change is ${validation.riskLevel}-risk and must be explicitly confirmed before it is applied.`,
      );
    }
  }

  // 7. Persist via the write-time guarded update (optimistic concurrency).
  //    A null result means the workflow changed after our read-time check —
  //    the patch is stale. We do NOT pretend success or auto-rebase here.
  let updated: WorkflowRecord | null;
  try {
    updated = await updateDraftDefinitionIfRevisionMatches({
      userId,
      workflowId,
      draftDefinition: candidate,
      expectedUpdatedAt: record.updatedAt,
    });
  } catch {
    return fail("UPDATE_FAILED", "Couldn't save the updated workflow. Try again.");
  }
  if (!updated) {
    return fail(
      "STALE_PATCH",
      "The workflow changed while this patch was being applied. Re-preview against the latest and try again.",
    );
  }

  const tasks = validation.taskCostEstimate?.estimatedTasksPerRun;
  const costClause = tasks !== undefined ? ` ~${tasks} task(s)/run.` : "";
  const summaryText =
    `Applied ${operations.length} change${operations.length === 1 ? "" : "s"} to "${updated.name}". ` +
    `Risk: ${validation.riskLevel}${validation.requiresConfirmation ? " (confirmed)" : ""}.${costClause}`;

  return {
    ok: true,
    workflowId,
    appliedPatchId: patch.patchId,
    appliedOperationCount: operations.length,
    affectedNodeIds: validation.affectedNodeIds,
    affectedEdgeIds: collectAffectedEdgeIds(operations),
    riskLevel: validation.riskLevel,
    requiresConfirmation: validation.requiresConfirmation,
    riskReasons: validation.riskReasons,
    ...(validation.taskCostEstimate ? { taskCostEstimate: validation.taskCostEstimate } : {}),
    workflow: {
      id: updated.id,
      name: updated.name,
      state: updated.state,
      nodeCount: updated.draftDefinition.nodes.length,
      edgeCount: updated.draftDefinition.edges.length,
    },
    updatedAt: updated.updatedAt,
    summaryText,
  };
}
