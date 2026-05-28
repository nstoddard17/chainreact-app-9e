/**
 * Slice 4.AI-35B — deterministic required-input completion (NO model call).
 *
 * After the planner has already identified the missing required fields (each
 * `requiredUserInput` entry carries `nodeId` + `field` + FieldMeta enrichment),
 * the user filling those EXACT fields is a mechanical operation: drop the
 * values into the pending patch's node config — or, for an existing-canvas-node
 * edit, build an `updateNodeConfig` op — then run the SAME deterministic
 * AI-5 preview + apply-readiness gate the planner uses. No interpretation is
 * needed, so no model call is made.
 *
 * This cuts the AI-COST-INCIDENT-1 class of waste (every "Send details" re-ran
 * the full planner) AND fixes the existing-Slack-DM-recipient edit, which had
 * been failing with "AI assistant is unavailable" because the follow-up always
 * went through the model and the model call failed.
 *
 * Safety (mirrors the planner's contract — this is NOT a bypass):
 *   - Never invents a field: only writes the `field` the planner already asked
 *     for, onto the `nodeId` it already identified.
 *   - Never updates the wrong node / creates an unrelated node: an answer that
 *     maps to neither a patch node nor an existing canvas node → `no_target_node`
 *     fallback (caller re-plans with the model).
 *   - Never bypasses WorkflowPatchSchema or preview validation: the completed
 *     patch goes through `previewWorkflowPatchForAI` (AI-3 validate + AI-5
 *     preview). A patch that doesn't validate / isn't apply-ready → fallback.
 *   - Never auto-applies (read-only; the user still clicks Apply).
 *   - provider_choice / free-text / multi-value answers are NOT handled here —
 *     the caller keeps those on the model re-plan path.
 *
 * Returns `{ ok: true, result }` with an apply-ready `PlanWorkflowSuccess`, or
 * `{ ok: false, reason }` so the caller falls back to the model planner.
 *
 * Plan reference: docs/slices/phase-4/react-agent-live-qa-matrix.md (AI-35B).
 */

import { previewWorkflowPatchForAI } from "@/services/ai/preview";
import { getWorkflowGraphForAI } from "@/services/ai/tools/workflowContext";
import type { PatchOperation, WorkflowPatch } from "@/services/workflows/patch/types";
import {
  WORKFLOW_PLAN_FEATURE,
  type CurrentWorkflowGraphView,
  type PlanModelMetadata,
  type PlanRequiredUserInput,
  type PlanWorkflowSuccess,
} from "./types";

/** One resolved answer: a value the user supplied for a planner-identified field. */
export interface CompletePlanRequiredInputAnswer {
  readonly nodeId: string;
  readonly field: string;
  readonly value: string;
  /** Multi-select field → the value is wrapped in an array. */
  readonly multiple?: boolean;
}

export interface CompletePlanInput {
  readonly userId: string;
  readonly workflowId: string;
  /** The pending plan's patch (may be null — e.g. an existing-node edit). */
  readonly proposedPatch: WorkflowPatch | null;
  readonly answers: readonly CompletePlanRequiredInputAnswer[];
  readonly currentGraph?: CurrentWorkflowGraphView;
  /** Carried onto the completed result for continuity (display only). */
  readonly intentSummary?: string;
  /** Non-blocking entries (e.g. `select_integration`) to preserve in the result. */
  readonly carryRequiredInput?: readonly PlanRequiredUserInput[];
}

export type CompletePlanFailureReason =
  | "no_answers"
  | "no_target_node"
  | "workflow_not_found"
  | "preview_unavailable"
  | "preview_rejected";

export type CompletePlanResult =
  | { readonly ok: true; readonly result: PlanWorkflowSuccess }
  | { readonly ok: false; readonly reason: CompletePlanFailureReason };

/** Sentinel model metadata — no model ran; this records that explicitly. */
const DETERMINISTIC_MODEL_META: PlanModelMetadata = {
  modelId: "deterministic-completion",
  tier: "strong",
  feature: WORKFLOW_PLAN_FEATURE,
};

function coerce(value: string, multiple: boolean | undefined): string | string[] {
  return multiple === true ? [value] : value;
}

/**
 * Apply each answer onto the patch in place (operating on a clone). Returns the
 * mutated operations array, or `null` when an answer maps to no patch node AND
 * no existing canvas node.
 */
function applyAnswers(
  baseOps: readonly PatchOperation[],
  answers: readonly CompletePlanRequiredInputAnswer[],
  canvasNodeIds: ReadonlySet<string>,
): PatchOperation[] | null {
  const ops: PatchOperation[] = baseOps.map((o) => structuredClone(o) as PatchOperation);
  for (const answer of answers) {
    const coerced = coerce(answer.value, answer.multiple);
    const target = ops.find((op) => opTargetsNode(op, answer.nodeId));
    if (target) {
      writeFieldToOp(target, answer.field, coerced);
      continue;
    }
    if (canvasNodeIds.has(answer.nodeId)) {
      // Existing-canvas-node edit → merge into (or create) an updateNodeConfig.
      const existing = ops.find(
        (op): op is Extract<PatchOperation, { op: "updateNodeConfig" }> =>
          op.op === "updateNodeConfig" && op.nodeId === answer.nodeId,
      );
      if (existing) {
        existing.config = { ...existing.config, [answer.field]: coerced };
      } else {
        ops.push({ op: "updateNodeConfig", nodeId: answer.nodeId, config: { [answer.field]: coerced } });
      }
      continue;
    }
    return null; // no_target_node
  }
  return ops;
}

function opTargetsNode(op: PatchOperation, nodeId: string): boolean {
  if ((op.op === "addNode" || op.op === "replaceTrigger") && op.node.id === nodeId) return true;
  if (op.op === "updateNodeConfig" && op.nodeId === nodeId) return true;
  return false;
}

function writeFieldToOp(op: PatchOperation, field: string, value: string | string[]): void {
  if (op.op === "addNode" || op.op === "replaceTrigger") {
    op.node.config = { ...(op.node.config ?? {}), [field]: value };
  } else if (op.op === "updateNodeConfig") {
    op.config = { ...op.config, [field]: value };
  }
}

export async function completePlanWithRequiredInputs(
  input: CompletePlanInput,
): Promise<CompletePlanResult> {
  if (input.answers.length === 0) return { ok: false, reason: "no_answers" };

  const canvasNodeIds = new Set((input.currentGraph?.nodes ?? []).map((n) => n.id));
  const baseOps = input.proposedPatch?.operations ?? [];
  const ops = applyAnswers(baseOps, input.answers, canvasNodeIds);
  if (ops === null || ops.length === 0) return { ok: false, reason: "no_target_node" };

  // Reconcile target + revision against the live workflow (ownership + NOT_FOUND
  // via AI-2), exactly like the planner — so the patch is apply-ready.
  const graphRes = await getWorkflowGraphForAI(input.userId, input.workflowId);
  if (!graphRes.ok) return { ok: false, reason: "workflow_not_found" };

  const patch: WorkflowPatch = {
    patchId: input.proposedPatch?.patchId ?? `complete-${graphRes.data.updatedAt}`,
    workflowId: input.workflowId,
    baseRevision: graphRes.data.updatedAt,
    operations: ops,
    summary: input.proposedPatch?.summary ?? "Apply the provided details",
    rationale: input.proposedPatch?.rationale ?? "User supplied the required field values.",
  };

  // Same deterministic preview (AI-3 validate + AI-5) the planner runs.
  const previewRes = await previewWorkflowPatchForAI({
    userId: input.userId,
    workflowId: input.workflowId,
    patch,
  });
  if (!previewRes.ok) return { ok: false, reason: "preview_unavailable" };
  const preview = previewRes.data;

  // Only succeed when the completed patch is genuinely apply-ready; otherwise
  // fall back to the model (it may be able to fix what the literal fill could not).
  if (!preview.canApplyLater) return { ok: false, reason: "preview_rejected" };

  // The remaining required input is the non-blocking carry-over (e.g.
  // select_integration) — the resolved config fields are now in the patch.
  const requiredUserInput = (input.carryRequiredInput ?? []).filter(
    (e) => e.kind === "select_integration",
  );

  const result: PlanWorkflowSuccess = {
    ok: true,
    intentSummary: input.intentSummary ?? "Updated the workflow with your details.",
    assumptions: [],
    requiredUserInput,
    unsupportedRequests: [],
    safetyNotes: [],
    proposedPatch: patch,
    preview,
    canApplyLater: true,
    model: DETERMINISTIC_MODEL_META,
    noMutation: true,
  };
  return { ok: true, result };
}
