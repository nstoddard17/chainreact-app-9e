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
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import type { PatchOperation, WorkflowPatch } from "@/services/workflows/patch/types";
import {
  WORKFLOW_PLAN_FEATURE,
  type CurrentWorkflowGraphView,
  type PlanModelMetadata,
  type PlanRequiredUserInput,
  type PlanWorkflowSuccess,
} from "./types";

/**
 * One resolved answer: a value the user supplied for a required field.
 *
 * `nodeId`/`field` identify the target when the planner enriched the entry
 * (AI-35B). Slice 4.AI-35F makes BOTH optional: a bare answer (a rendered
 * required text control whose entry had no node identity — e.g. a null-patch
 * plan's "What should the message say?") arrives untargeted, and the server
 * infers the unique missing required text field from the pending patch.
 */
export interface CompletePlanRequiredInputAnswer {
  readonly nodeId?: string;
  readonly field?: string;
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
  | "ambiguous_target"
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

/** Renderer types whose value is a single user-supplied string. */
const TEXT_FIELD_TYPES: ReadonlySet<string> = new Set(["text", "textarea"]);
const AI_FIELD_RE = /\{\{\s*AI_FIELD:/;

/**
 * A config value is "fillable" — i.e. the user's answer can replace it —
 * when it is empty (undefined / null / "" / []) OR an unresolved
 * `{{AI_FIELD:…}}` placeholder. A literal value or a `{{nodeId.field}}`
 * reference is a real model choice and is NOT overwritten.
 */
function isFillableValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "string" && AI_FIELD_RE.test(value)) return true;
  return false;
}

interface FieldTarget {
  readonly nodeId: string;
  readonly field: string;
}

/**
 * Slice 4.AI-35F — collect every REQUIRED text/textarea field on the patch's
 * pending `addNode` / `replaceTrigger` nodes whose value is still fillable.
 * Generic + metadata-driven (ActionMeta / TriggerMeta / FieldMeta) — no
 * provider-specific logic. This is the candidate set a BARE answer (no node
 * identity) is matched against; the caller only fills when the match is unique.
 */
function collectFillableRequiredTextFields(ops: readonly PatchOperation[]): FieldTarget[] {
  const out: FieldTarget[] = [];
  for (const op of ops) {
    if (op.op !== "addNode" && op.op !== "replaceTrigger") continue;
    const node = op.node;
    if (typeof node?.provider !== "string" || typeof node?.type !== "string") continue;
    const key = `${node.provider}:${node.type}`;
    const meta = node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
    if (!meta) continue;
    const config = (node.config ?? {}) as Record<string, unknown>;
    for (const f of meta.fields) {
      if (!f.required) continue;
      if (!TEXT_FIELD_TYPES.has(f.type)) continue;
      if (isFillableValue(config[f.name])) out.push({ nodeId: node.id, field: f.name });
    }
  }
  return out;
}

type ApplyAnswersResult =
  | { readonly ok: true; readonly ops: PatchOperation[] }
  | { readonly ok: false; readonly reason: CompletePlanFailureReason };

/**
 * Apply each answer onto the patch (operating on a clone).
 *
 *   - TARGETED answers (nodeId + field, AI-35B): written to the matching patch
 *     op, or — for an existing-canvas node — merged into / appended as an
 *     `updateNodeConfig`. An answer that maps to neither → `no_target_node`.
 *   - BARE answers (no node identity, AI-35F): mapped to a UNIQUE fillable
 *     required text field inferred from the patch. Conservative: at most one
 *     bare answer is inferred, and only when exactly one candidate field
 *     remains. Multiple bare answers or multiple candidates → `ambiguous_target`
 *     (never guess); no candidate → `no_target_node` (unless a targeted answer
 *     already filled the sole candidate, in which case the bare answer is a
 *     redundant no-op and completion still succeeds).
 */
function applyAnswers(
  baseOps: readonly PatchOperation[],
  answers: readonly CompletePlanRequiredInputAnswer[],
  canvasNodeIds: ReadonlySet<string>,
): ApplyAnswersResult {
  const ops: PatchOperation[] = baseOps.map((o) => structuredClone(o) as PatchOperation);
  const targeted = answers.filter((a) => a.nodeId && a.field);
  const bare = answers.filter((a) => !a.nodeId || !a.field);

  // 1. Targeted answers (AI-35B).
  for (const answer of targeted) {
    const nodeId = answer.nodeId as string;
    const field = answer.field as string;
    const coerced = coerce(answer.value, answer.multiple);
    const target = ops.find((op) => opTargetsNode(op, nodeId));
    if (target) {
      writeFieldToOp(target, field, coerced);
      continue;
    }
    if (canvasNodeIds.has(nodeId)) {
      // Existing-canvas-node edit → merge into (or create) an updateNodeConfig.
      const existing = ops.find(
        (op): op is Extract<PatchOperation, { op: "updateNodeConfig" }> =>
          op.op === "updateNodeConfig" && op.nodeId === nodeId,
      );
      if (existing) {
        existing.config = { ...existing.config, [field]: coerced };
      } else {
        ops.push({ op: "updateNodeConfig", nodeId, config: { [field]: coerced } });
      }
      continue;
    }
    return { ok: false, reason: "no_target_node" };
  }

  // 2. Bare answers — infer a unique fillable required text field (AI-35F).
  if (bare.length > 0) {
    if (bare.length > 1) return { ok: false, reason: "ambiguous_target" };
    const targetedKeys = new Set(targeted.map((a) => `${a.nodeId}::${a.field}`));
    const candidates = collectFillableRequiredTextFields(ops).filter(
      (c) => !targetedKeys.has(`${c.nodeId}::${c.field}`),
    );
    if (candidates.length === 1) {
      const t = candidates[0]!;
      const op = ops.find((o) => opTargetsNode(o, t.nodeId));
      if (!op) return { ok: false, reason: "no_target_node" };
      writeFieldToOp(op, t.field, bare[0]!.value);
    } else if (candidates.length === 0) {
      // No remaining candidate. If the patch had a fillable field that a
      // targeted answer already filled, the bare answer is redundant → no-op.
      // Otherwise there is genuinely nothing to map it to.
      if (collectFillableRequiredTextFields(baseOps).length === 0) {
        return { ok: false, reason: "no_target_node" };
      }
    } else {
      return { ok: false, reason: "ambiguous_target" };
    }
  }

  return { ok: true, ops };
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
  const applied = applyAnswers(baseOps, input.answers, canvasNodeIds);
  if (!applied.ok) return { ok: false, reason: applied.reason };
  const ops = applied.ops;
  if (ops.length === 0) return { ok: false, reason: "no_target_node" };

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
