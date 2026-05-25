import { z } from "zod";
import type { RiskLevel } from "@/contracts/actionMeta";
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";
import { estimateWorkflowTaskCost } from "@/services/billing/workflowCostEstimator";
import { applyPatchToDefinition } from "./applyPatchToDefinition";
import {
  checkBranchLabels,
  checkNodeRegistryAndConfig,
  checkStructure,
} from "./checks";
import { checkNodeVariableReferences } from "./variableChecks";
import { classifyPatchRisk } from "./riskClassification";
import { WorkflowPatchSchema } from "./workflowPatchSchema";
import type {
  PatchOperation,
  PatchValidationError,
  PatchValidationResult,
  PatchValidationWarning,
  ValidateWorkflowPatchOptions,
  WorkflowPatch,
} from "./types";

/**
 * Deterministic WorkflowPatch validator (Slice 4.AI-3).
 *
 * The future React Agent proposes a `WorkflowPatch`; this function — pure,
 * deterministic, no model calls, no DB writes, no workflow mutation — decides
 * whether it is safe to preview/apply. It NEVER trusts the patch's proposed
 * `riskLevel` / `requiresConfirmation`; both are recomputed here.
 *
 * Pipeline:
 *   1. Envelope/operation structural parse (Zod).
 *   2. Optimistic-concurrency check (baseRevision).
 *   3. Atomic apply onto a clone → candidate definition (input never mutated).
 *   4. Structural validation of the candidate (ids, triggers, edges).
 *   5. Registry grounding + FieldMeta config validation (affected nodes).
 *   6. Variable-reference validation (affected nodes).
 *   7. Branch-label sanity warnings.
 *   8. Deterministic risk/confirmation classification.
 *   9. COST-2 task-cost estimate over the candidate.
 *
 * No-leak guarantee: every error/warning message is built from ids, field
 * KEY names, and registry metadata only — never from resolved config VALUES.
 */

function emptyCostlessResult(
  errors: PatchValidationError[],
  warnings: PatchValidationWarning[],
  previewSummary: string,
): PatchValidationResult {
  return {
    ok: false,
    errors,
    warnings,
    riskLevel: "low",
    requiresConfirmation: false,
    riskReasons: [],
    affectedNodeIds: [],
    previewSummary,
  };
}

function mapParseError(error: z.ZodError): PatchValidationError[] {
  const errors: PatchValidationError[] = [];
  for (const issue of error.issues) {
    const opIndex =
      issue.path[0] === "operations" && typeof issue.path[1] === "number"
        ? issue.path[1]
        : undefined;
    if (issue.code === z.ZodIssueCode.invalid_union_discriminator) {
      errors.push({
        code: "UNSUPPORTED_OPERATION",
        message: `Unsupported operation${opIndex !== undefined ? ` at index ${opIndex}` : ""}: ${issue.message}`,
        ...(opIndex !== undefined ? { operationIndex: opIndex } : {}),
      });
    } else {
      errors.push({
        code: "INVALID_PATCH",
        message: `${issue.path.join(".") || "patch"}: ${issue.message}`,
        ...(opIndex !== undefined ? { operationIndex: opIndex } : {}),
      });
    }
  }
  return errors;
}

function collectAffectedNodeIds(operations: readonly PatchOperation[]): string[] {
  const ids = new Set<string>();
  for (const op of operations) {
    switch (op.op) {
      case "addNode":
      case "replaceTrigger":
        ids.add(op.node.id);
        break;
      case "updateNodeConfig":
      case "removeNode":
      case "moveNode":
      case "repairVariableReference":
        ids.add(op.nodeId);
        break;
      case "addEdge":
      case "replaceEdge":
        ids.add(op.edge.from);
        ids.add(op.edge.to);
        break;
      case "removeEdge":
        break;
    }
  }
  return [...ids];
}

/** Node ids whose registry/config/variable correctness the patch changed. */
function collectConfigAffectedIds(
  operations: readonly PatchOperation[],
): Set<string> {
  const ids = new Set<string>();
  for (const op of operations) {
    if (op.op === "addNode") ids.add(op.node.id);
    else if (op.op === "updateNodeConfig") ids.add(op.nodeId);
    else if (op.op === "repairVariableReference") ids.add(op.nodeId);
    else if (op.op === "replaceTrigger") ids.add(op.node.id);
  }
  return ids;
}

function buildPreviewSummary(
  operations: readonly PatchOperation[],
  estimatedTasksPerRun: number | null,
): string {
  const counts = new Map<string, number>();
  for (const op of operations) counts.set(op.op, (counts.get(op.op) ?? 0) + 1);
  const parts = [...counts.entries()].map(([op, n]) => `${op}×${n}`);
  const cost =
    estimatedTasksPerRun === null
      ? ""
      : `; ~${estimatedTasksPerRun} task(s)/run`;
  return `${parts.join(", ")}${cost}`;
}

export function validateWorkflowPatch(
  patch: WorkflowPatch,
  currentDefinition: WorkflowDefinition,
  options: ValidateWorkflowPatchOptions = {},
): PatchValidationResult {
  // 1. Structural envelope/operation parse.
  const parsed = WorkflowPatchSchema.safeParse(patch);
  if (!parsed.success) {
    const errors = mapParseError(parsed.error);
    return emptyCostlessResult(errors, [], `Invalid patch — ${errors.length} error(s)`);
  }
  const operations = parsed.data.operations as PatchOperation[];

  const errors: PatchValidationError[] = [];
  const warnings: PatchValidationWarning[] = [];
  const affectedNodeIds = collectAffectedNodeIds(operations);

  // 2. Optimistic concurrency.
  if (parsed.data.baseRevision.trim() === "") {
    errors.push({
      code: "BASE_REVISION_MISSING",
      message: "Patch has no baseRevision; cannot guard against concurrent edits.",
    });
  } else if (
    options.currentRevision !== undefined &&
    options.currentRevision !== parsed.data.baseRevision
  ) {
    errors.push({
      code: "PATCH_CONFLICT",
      message: `Patch baseRevision '${parsed.data.baseRevision}' does not match the current revision '${options.currentRevision}'. Re-plan against the latest workflow.`,
    });
  }

  // 3. Atomic apply → candidate (input never mutated).
  const applied = applyPatchToDefinition(currentDefinition, operations);
  if (!applied.ok) {
    errors.push(...applied.errors);
    return {
      ...emptyCostlessResult(errors, warnings, buildPreviewSummary(operations, null)),
      affectedNodeIds,
    };
  }
  const candidate = applied.definition;

  // 4. Structural validation of the candidate.
  errors.push(...checkStructure(candidate));
  const schemaParse = WorkflowDefinitionSchema.safeParse(candidate);
  if (!schemaParse.success && errors.length === 0) {
    errors.push({
      code: "INVALID_PATCH",
      message: `Candidate workflow failed structural validation: ${schemaParse.error.issues[0]?.message ?? "unknown"}.`,
    });
  }

  // 5 + 6. Registry/config + variable references for changed nodes.
  const configAffected = collectConfigAffectedIds(operations);
  for (const node of candidate.nodes) {
    if (!configAffected.has(node.id)) continue;
    const rc = checkNodeRegistryAndConfig(node);
    errors.push(...rc.errors);
    warnings.push(...rc.warnings);
    errors.push(...checkNodeVariableReferences(candidate, node));
  }

  // 7. Branch-label sanity.
  warnings.push(...checkBranchLabels(candidate));

  // 8. Deterministic risk classification (overrides any model-provided values).
  const risk = classifyPatchRisk(currentDefinition, candidate, operations);
  warnings.push(...risk.warnings);

  // 9. COST-2 task-cost estimate over the candidate.
  let taskCostEstimate;
  let estimatedTasksPerRun: number | null = null;
  try {
    taskCostEstimate = estimateWorkflowTaskCost(candidate);
    estimatedTasksPerRun = taskCostEstimate.estimatedTasksPerRun;
    for (const w of taskCostEstimate.warnings) {
      warnings.push({ code: "COST_WARNING", message: w.message, ...(w.nodeId ? { nodeId: w.nodeId } : {}) });
    }
  } catch (err) {
    errors.push({
      code: "COST_ESTIMATE_FAILED",
      message: `Cost estimate failed: ${(err as Error).message}`,
    });
  }

  const riskLevel: RiskLevel = risk.riskLevel;
  return {
    ok: errors.length === 0,
    candidateDefinition: candidate,
    errors,
    warnings,
    riskLevel,
    requiresConfirmation: risk.requiresConfirmation,
    riskReasons: risk.riskReasons,
    ...(taskCostEstimate ? { taskCostEstimate } : {}),
    affectedNodeIds,
    previewSummary: buildPreviewSummary(operations, estimatedTasksPerRun),
  };
}
