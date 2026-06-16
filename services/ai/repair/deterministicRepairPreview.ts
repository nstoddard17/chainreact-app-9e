import type { WorkflowDefinition } from "@/contracts/workflow";
import type { AgentWorkflowDiagnosisDTO } from "@/services/ai/diagnostics/diagnoseWorkflowForAgent";
import { getWorkflowGraphForAI, type WorkflowGraphView } from "@/services/ai/tools/workflowContext";
import { previewWorkflowPatchForAI } from "@/services/ai/preview";
import type { PatchPreviewResult } from "@/services/ai/preview/types";
import type { PatchOperation, WorkflowPatch } from "@/services/workflows/patch/types";
import { buildVariableRepairOutcome } from "./repairStrategies";

/**
 * Deterministic, MODEL-FREE repair preview (Slice 4.AI-REPAIR-3G/3H).
 *
 * The variable-reference repair is fully deterministic — no LLM is consulted. 3H
 * makes that path FREE: the route calls `runDeterministicRepairPreview` BEFORE the
 * AI credit gate / OpenAI-config check / model client, so a deterministic preview
 * costs no AI credits and emits NO `ai_model_call_*` telemetry. Only when this
 * returns null (no safe deterministic repair) does the route fall through to the
 * paid, credit-gated, telemetered model path in `previewWorkflowRepair`.
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
 * Build a deterministic `repairVariableReference` preview for one target node using
 * the EXISTING strategy (`buildVariableRepairOutcome`): it emits an op ONLY when
 * there is exactly one broken reference AND exactly one matching upstream
 * replacement. The op runs through the SAME deterministic preview engine
 * (`previewWorkflowPatchForAI` — validation + apply-safety + recomputed risk), so a
 * recipient/secret/credential field is blocked there exactly as for any other op.
 * Returns the applyable `PatchPreviewResult` (`preview.ok === true`) or null.
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

  const patch: WorkflowPatch = {
    patchId: `repair-preview-var:${args.workflowId}`,
    workflowId: args.workflowId,
    baseRevision: args.graph.updatedAt,
    operations: [...outcome.operations] as PatchOperation[],
    summary: "Re-point the broken variable reference",
    rationale: outcome.recommendations[0] ?? "Deterministic variable-reference repair.",
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
    return null; // fall through to the model path
  }
  // Only an applyable (cleanly validated) preview is a deterministic fix. A blocked
  // preview (safety-sensitive field / candidate didn't validate) → null → model path.
  if (!res || !res.ok || res.data.ok !== true) return null;
  return res.data;
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
 * telemetry for a non-null result — the whole point of 3H is that a fully
 * deterministic preview is free and emits no `ai_model_call_*` event. It also does NOT
 * require OpenAI to be configured. Short-circuits with NO graph read when the diagnosis
 * carries no invalid-variable-reference finding, so the common (missing-field /
 * connection) preview pays zero overhead before the existing gated model path.
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
