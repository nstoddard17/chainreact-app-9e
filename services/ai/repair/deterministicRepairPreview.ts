import { z } from "zod";
import type { WorkflowDefinition } from "@/contracts/workflow";
import type { AgentWorkflowDiagnosisDTO } from "@/services/ai/diagnostics/diagnoseWorkflowForAgent";
import { findInvalidVariableReferences } from "@/core/workflows/invalidVariableReferences";
import { getWorkflowGraphForAI, type WorkflowGraphView } from "@/services/ai/tools/workflowContext";
import { getAvailableVariablesForAI } from "@/services/ai/tools/variables";
import { previewWorkflowPatchForAI } from "@/services/ai/preview";
import type { PatchPreviewResult } from "@/services/ai/preview/types";
import type { PatchOperation, WorkflowPatch } from "@/services/workflows/patch/types";
import {
  buildVariableRepairOutcome,
  buildEdgeRepairOutcome,
  buildSelfLoopEdgeRepairOutcome,
} from "./repairStrategies";

/**
 * Deterministic, MODEL-FREE repair preview (Slice 4.AI-REPAIR-3G/3H/3L).
 *
 * The variable-reference repair is fully deterministic — no LLM is consulted. 3H
 * makes that path FREE: the route calls these helpers BEFORE the AI credit gate /
 * OpenAI-config check / model client, so a deterministic preview costs no AI credits
 * and emits NO `ai_model_call_*` telemetry. Only when the (auto) one-candidate path
 * returns null does the route fall through to the paid, credit-gated, telemetered
 * model path in `previewWorkflowRepair`.
 *
 * Two entry points:
 *   - `runDeterministicRepairPreview` (3G/3H) — AUTOMATIC, only for the unambiguous
 *     single-broken-ref + single-candidate case. Never picks among multiple.
 *   - `runSelectedVariableRepairPreview` (3L) — EXPLICIT user-chosen replacement for
 *     the multiple-candidate case. The selection is re-validated server-side (it must
 *     be a real upstream candidate for that exact broken ref) so a client can't inject
 *     an arbitrary reference; it then runs the SAME validation + apply-safety engine.
 *     This path NEVER reaches the model — an invalid/unsafe selection returns null.
 *
 * Extracted from `previewWorkflowRepair.ts` so the model-free path and the model
 * path are physically separate (and each module stays under the line cap).
 */

/** First diagnosed broken-variable-reference node id (internal target), or null. */
function firstInvalidVariableRefNodeId(dto: AgentWorkflowDiagnosisDTO): string | null {
  for (const f of dto.findings ?? []) {
    if (f.code === "INVALID_VARIABLE_REFERENCE" && f.nodeIds && f.nodeIds.length > 0) {
      return f.nodeIds[0] ?? null;
    }
  }
  return null;
}

/**
 * Build a single-op `repairVariableReference` patch and run it through the EXISTING
 * deterministic preview engine (`previewWorkflowPatchForAI` — validation +
 * apply-safety + recomputed risk), so a recipient/secret/credential field is blocked
 * there exactly as for any other op. Returns the applyable `PatchPreviewResult`
 * (`preview.ok === true`) or null (blocked / failed → caller's fallback).
 */
async function previewRepairOps(args: {
  userId: string;
  workflowId: string;
  graph: WorkflowGraphView;
  operations: readonly PatchOperation[];
  summary: string;
  rationale: string;
  patchIdPrefix: string;
  draftDefinition?: WorkflowDefinition;
}): Promise<PatchPreviewResult | null> {
  if (args.operations.length === 0) return null;
  const patch: WorkflowPatch = {
    patchId: `${args.patchIdPrefix}:${args.workflowId}`,
    workflowId: args.workflowId,
    baseRevision: args.graph.updatedAt,
    operations: [...args.operations],
    summary: args.summary,
    rationale: args.rationale,
  };

  let res;
  try {
    res = await previewWorkflowPatchForAI({
      userId: args.userId,
      workflowId: args.workflowId,
      patch,
      ...(args.draftDefinition ? { draftDefinition: args.draftDefinition } : {}),
    });
  } catch {
    return null; // fall through to the caller's fallback
  }
  // Only an applyable (cleanly validated) preview is a deterministic fix. A blocked
  // preview (safety-sensitive field / candidate didn't validate) → null.
  if (!res || !res.ok || res.data.ok !== true) return null;
  return res.data;
}

/**
 * Build a deterministic `repairVariableReference` preview for one target node using
 * the EXISTING strategy (`buildVariableRepairOutcome`): it emits an op ONLY when
 * there is exactly one broken reference AND exactly one matching upstream
 * replacement. Returns the applyable `PatchPreviewResult` or null.
 */
async function previewDeterministicVariableRepair(args: {
  userId: string;
  workflowId: string;
  targetNodeId: string;
  graph: WorkflowGraphView;
  draftDefinition?: WorkflowDefinition;
}): Promise<PatchPreviewResult | null> {
  const outcome = await buildVariableRepairOutcome(args.userId, args.workflowId, args.graph, args.targetNodeId);
  if (outcome.repairability !== "repairable" || outcome.operations.length === 0) return null;
  return previewRepairOps({
    userId: args.userId,
    workflowId: args.workflowId,
    graph: args.graph,
    operations: [outcome.operations[0] as PatchOperation],
    summary: "Re-point the broken variable reference",
    rationale: outcome.recommendations[0] ?? "Deterministic variable-reference repair.",
    patchIdPrefix: "repair-preview-var",
    ...(args.draftDefinition ? { draftDefinition: args.draftDefinition } : {}),
  });
}

export interface DeterministicRepairPreviewInput {
  /** Re-derived server-side by the route (access==="OK"). Never client-posted. */
  readonly dto: AgentWorkflowDiagnosisDTO;
  readonly userId: string;
  readonly workflowId: string;
  /** Trusted current-draft snapshot (validated by the route); never persisted. */
  readonly draftDefinition?: WorkflowDefinition;
}

/**
 * Route-callable, MODEL-FREE deterministic repair preview. Returns an applyable
 * preview ONLY for the safe single-broken-variable-reference case; null for
 * everything else (the caller then runs the paid model path).
 *
 * Makes NO model call, so the caller MUST NOT run the AI credit gate or record model
 * telemetry for a non-null result. Short-circuits with NO graph read when the diagnosis
 * carries no invalid-variable-reference finding.
 */
export async function runDeterministicRepairPreview(
  input: DeterministicRepairPreviewInput,
): Promise<{ ok: true; preview: PatchPreviewResult } | null> {
  const targetNodeId = firstInvalidVariableRefNodeId(input.dto);
  if (!targetNodeId) return null;

  const graphRes = await getWorkflowGraphForAI(input.userId, input.workflowId);
  if (!graphRes.ok) return null; // fall through to the model path (surfaces GRAPH_UNAVAILABLE safely)

  const preview = await previewDeterministicVariableRepair({
    userId: input.userId,
    workflowId: input.workflowId,
    targetNodeId,
    graph: graphRes.data,
    ...(input.draftDefinition ? { draftDefinition: input.draftDefinition } : {}),
  });
  return preview ? { ok: true, preview } : null;
}

// ─── AI-REPAIR-3L — explicit user-selected replacement (multiple-candidate case) ──

/**
 * A user's EXPLICIT replacement choice for a broken variable reference. `nodeId` +
 * `fieldKey` target the broken field; `newReference` is the `{{...}}` token of the
 * candidate the user picked. All three are re-validated server-side before use — the
 * client choice is never trusted to point anywhere it likes.
 */
export const SelectedRepairSchema = z.object({
  nodeId: z.string().min(1),
  fieldKey: z.string().min(1),
  // A variable reference token only — never arbitrary text / an operation blob.
  newReference: z.string().min(1).max(512).regex(/^\{\{.+\}\}$/),
});
export type SelectedRepairSelection = z.infer<typeof SelectedRepairSchema>;

/**
 * Parse a request body's `selectedRepair` into a validated selection.
 *   - `undefined` → the key was absent (no explicit selection; normal flow).
 *   - `null`      → the key was present but malformed (handle as a no-safe-fix, never
 *                   fall through to the paid model path).
 *   - object      → a structurally valid selection (still re-validated against the
 *                   server-computed candidate set in `runSelectedVariableRepairPreview`).
 */
export function parseSelectedRepairSelection(
  body: unknown,
): SelectedRepairSelection | null | undefined {
  const raw = (body as { selectedRepair?: unknown } | null | undefined)?.selectedRepair;
  if (raw === undefined) return undefined;
  const parsed = SelectedRepairSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export interface SelectedRepairPreviewInput {
  readonly userId: string;
  readonly workflowId: string;
  readonly selection: SelectedRepairSelection;
  readonly draftDefinition?: WorkflowDefinition;
}

/**
 * Route-callable, MODEL-FREE deterministic preview for a user-SELECTED replacement.
 *
 * Anti-injection: re-derives the graph + the broken reference on `(nodeId, fieldKey)`
 * and the SAFE upstream candidate set (`getAvailableVariablesForAI` filtered to the
 * broken ref's path), and proceeds ONLY when the selected `newReference` is one of
 * those server-computed candidates. The op then runs through the SAME
 * validation/apply-safety engine, so a secret/recipient/credential target field is
 * still blocked. Returns the applyable preview or null (invalid/unsafe selection).
 * NEVER calls the model, the gate, or telemetry.
 */
export async function runSelectedVariableRepairPreview(
  input: SelectedRepairPreviewInput,
): Promise<{ ok: true; preview: PatchPreviewResult } | null> {
  const { userId, workflowId, selection } = input;

  const graphRes = await getWorkflowGraphForAI(userId, workflowId);
  if (!graphRes.ok) return null;
  const graph = graphRes.data;

  // The selected field must currently hold EXACTLY ONE broken reference.
  const broken = findInvalidVariableReferences(graph.nodes).filter(
    (r) => r.nodeId === selection.nodeId && r.fieldKey === selection.fieldKey,
  );
  if (broken.length !== 1) return null;
  const b = broken[0]!;

  // The selected reference must be a real upstream candidate for THIS broken ref's
  // path (same source the diagnosis used to build the picker options).
  const vars = await getAvailableVariablesForAI(userId, workflowId, selection.nodeId);
  if (!vars.ok) return null;
  const isAllowedCandidate = vars.data.variables.some(
    (v) => v.path === b.refPath && v.reference === selection.newReference,
  );
  if (!isAllowedCandidate) return null;

  const preview = await previewRepairOps({
    userId,
    workflowId,
    graph,
    operations: [{ op: "repairVariableReference", nodeId: selection.nodeId, fieldPath: b.fieldKey, newReference: selection.newReference }],
    summary: "Re-point the broken variable reference",
    rationale: "Deterministic variable-reference repair (user-selected replacement).",
    patchIdPrefix: "repair-preview-var",
    ...(input.draftDefinition ? { draftDefinition: input.draftDefinition } : {}),
  });
  return preview ? { ok: true, preview } : null;
}

// ─── AI-REPAIR-4A — deterministic dangling/broken-edge cleanup ────────────────

/** True when the diagnosis carries at least one dangling/stale-edge finding. */
function hasDanglingEdgeFinding(dto: AgentWorkflowDiagnosisDTO): boolean {
  return (dto.findings ?? []).some(
    (f) => f.code === "STALE_EDGE" && f.danglingEdges && f.danglingEdges.length > 0,
  );
}

export interface DanglingEdgeRepairPreviewInput {
  readonly dto: AgentWorkflowDiagnosisDTO;
  readonly userId: string;
  readonly workflowId: string;
  readonly draftDefinition?: WorkflowDefinition;
}

/**
 * Route-callable, MODEL-FREE deterministic preview for dangling/broken-edge cleanup
 * (AI-REPAIR-4A). A dangling edge is one whose `from` or `to` node id no longer exists
 * in the workflow. The repair is the narrow, safe `removeEdge` op (no node deletion, no
 * new endpoints, no branch-label/trigger changes) sourced from the EXISTING
 * `buildEdgeRepairOutcome`, then run through the SAME validate + apply-safety engine.
 *
 * Because the patch validator rejects a candidate that STILL contains a dangling edge,
 * this removes ALL dangling edges in one preview — so the candidate validates clean
 * (the "remove only the broken edge(s); everything else preserved" contract). If
 * removing them leaves an otherwise-invalid structure, validation blocks → null
 * (fail-closed). NEVER calls the model, the gate, or telemetry. Short-circuits with no
 * graph read when the diagnosis has no dangling-edge finding.
 */
export async function runDanglingEdgeRepairPreview(
  input: DanglingEdgeRepairPreviewInput,
): Promise<{ ok: true; preview: PatchPreviewResult } | null> {
  if (!hasDanglingEdgeFinding(input.dto)) return null;

  const graphRes = await getWorkflowGraphForAI(input.userId, input.workflowId);
  if (!graphRes.ok) return null;
  const graph = graphRes.data;

  const outcome = buildEdgeRepairOutcome(graph);
  if (!outcome || outcome.repairability !== "repairable" || outcome.operations.length === 0) return null;

  // AI-REPAIR-4B — count-aware summary so the preview copy is honest about batch removal:
  // every dangling edge is removed in this one preview (the validator rejects a candidate
  // that still holds one), so multiple broken connections must read as plural, not singular.
  const removeCount = outcome.operations.length;
  const summary =
    removeCount === 1
      ? "Remove the broken connection to a missing step"
      : `Remove all ${removeCount} broken connections to missing steps`;

  const preview = await previewRepairOps({
    userId: input.userId,
    workflowId: input.workflowId,
    graph,
    operations: outcome.operations as PatchOperation[],
    summary,
    rationale: outcome.recommendations[0] ?? "Deterministic dangling-edge cleanup.",
    patchIdPrefix: "repair-preview-edge",
    ...(input.draftDefinition ? { draftDefinition: input.draftDefinition } : {}),
  });
  return preview ? { ok: true, preview } : null;
}

// ─── AI-REPAIR-COVERAGE-1 — deterministic self-loop edge cleanup ──────────────

/** True when the diagnosis carries at least one self-loop-edge finding. */
function hasSelfLoopEdgeFinding(dto: AgentWorkflowDiagnosisDTO): boolean {
  return (dto.findings ?? []).some((f) => f.code === "SELF_LOOP_EDGE");
}

export interface SelfLoopEdgeRepairPreviewInput {
  readonly dto: AgentWorkflowDiagnosisDTO;
  readonly userId: string;
  readonly workflowId: string;
  readonly draftDefinition?: WorkflowDefinition;
}

/**
 * Route-callable, MODEL-FREE deterministic preview for self-loop edge cleanup. A
 * self-loop is an edge whose `from` and `to` are the SAME node (a step wired to itself).
 * The repair is the narrow, safe `removeEdge` op (no node deletion, no new endpoints,
 * no branch-label/trigger changes) sourced from `buildSelfLoopEdgeRepairOutcome`, then
 * run through the SAME validate + apply-safety engine.
 *
 * Like the dangling-edge cleanup, the patch validator rejects a candidate that STILL
 * contains an invalid edge, so this removes ALL self-loops in one preview → the candidate
 * validates clean. If another invalid edge (e.g. a dangling one) remains, validation blocks
 * → null (fail-closed; the dangling-edge repair handles that case). NEVER calls the model,
 * the gate, or telemetry. Short-circuits with no graph read when there's no self-loop finding.
 */
export async function runSelfLoopEdgeRepairPreview(
  input: SelfLoopEdgeRepairPreviewInput,
): Promise<{ ok: true; preview: PatchPreviewResult } | null> {
  if (!hasSelfLoopEdgeFinding(input.dto)) return null;

  const graphRes = await getWorkflowGraphForAI(input.userId, input.workflowId);
  if (!graphRes.ok) return null;
  const graph = graphRes.data;

  const outcome = buildSelfLoopEdgeRepairOutcome(graph);
  if (!outcome || outcome.repairability !== "repairable" || outcome.operations.length === 0) return null;

  const removeCount = outcome.operations.length;
  const summary =
    removeCount === 1
      ? "Remove the connection from a step to itself"
      : `Remove all ${removeCount} connections from a step to itself`;

  const preview = await previewRepairOps({
    userId: input.userId,
    workflowId: input.workflowId,
    graph,
    operations: outcome.operations as PatchOperation[],
    summary,
    rationale: outcome.recommendations[0] ?? "Deterministic self-loop edge cleanup.",
    patchIdPrefix: "repair-preview-selfloop",
    ...(input.draftDefinition ? { draftDefinition: input.draftDefinition } : {}),
  });
  return preview ? { ok: true, preview } : null;
}
