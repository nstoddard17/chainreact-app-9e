/**
 * AI route event emission (Slice 4.AI-10).
 *
 * The EMISSION layer that connects the live AI plan/apply flows (AI-9A/9B) to
 * the EXISTING AI observability ledger (`ai_cost_events`, COST-6) via the
 * existing recorder helpers (`services/billing/aiCostEvents`). AI-10 adds NO new
 * table and NO new recorder/sanitizer — COST-6/COST-7 already own the ledger,
 * `sanitizeAiEventMetadata`, and `ownerAiStats` analytics. This module only maps
 * a `PlanWorkflowResult` / `ApplyWorkflowPatchResult` onto the existing event
 * taxonomy.
 *
 * FAIL-OPEN: analytics must NEVER break the AI flow. Every function swallows all
 * errors (the recorder may throw on an insert failure / missing service-role
 * env). It also never persists raw prompts/completions/config — it forwards only
 * ids, codes, counts, model names, token counts, and latency; the recorder
 * sanitizes `metadata` again as defense in depth.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §16.
 */

import { getModelById } from "@/core/ai/models";
import {
  recordAiCostEvent,
  recordAiModelCallCompleted,
  recordAiModelCallFailed,
  recordAiPatchOutcome,
  recordAiSafetyBlock,
  type AiEventScope,
} from "@/services/billing/aiCostEvents";
import type { ApplyWorkflowPatchResult } from "@/services/ai/apply";
import type { PlanWorkflowResult } from "@/services/ai/planner";

export interface AiRouteEventScope {
  readonly userId: string;
  readonly workflowId?: string | null;
  /** The request's patch id (apply route) — used for failure events. */
  readonly patchId?: string | null;
}

/** Registry provider for a model id (analytics dimension); undefined if unknown. */
function providerOf(modelId: string | undefined): string | undefined {
  return modelId ? getModelById(modelId)?.provider : undefined;
}

/**
 * Emit the event sequence for a plan-route outcome (feature: workflow_creation):
 * `ai_interaction_started` → a model event (completed / failed with stage) →
 * patch events (proposed → previewed | validation_failed). Fail-open.
 */
export async function recordAiPlanOutcome(
  input: AiRouteEventScope,
  result: PlanWorkflowResult,
): Promise<void> {
  try {
    const patchId = result.ok ? result.proposedPatch?.patchId ?? null : null;
    const scope: AiEventScope = {
      userId: input.userId,
      feature: "workflow_creation",
      workflowId: input.workflowId ?? null,
      patchId,
    };

    // 1. The interaction itself (funnel denominator).
    await recordAiCostEvent({ ...scope, eventType: "ai_interaction_started" });

    const model = result.model;
    const modelName = model?.modelId;
    const modelProvider = providerOf(modelName);

    // 2. Model event. A model-API failure and an unparseable response are both
    //    "no usable model output" — recorded as a failed call, distinguished by
    //    metadata.stage.
    if (!result.ok && result.code === "MODEL_FAILED") {
      await recordAiModelCallFailed(scope, {
        ...(modelName ? { modelName } : {}),
        ...(modelProvider ? { modelProvider } : {}),
        ...(model?.latencyMs !== undefined ? { latencyMs: model.latencyMs } : {}),
        metadata: { stage: "model", code: result.errors[0]?.code ?? "unknown" },
      });
      return;
    }
    if (!result.ok && result.code === "PARSE_FAILED") {
      await recordAiModelCallFailed(scope, {
        ...(modelName ? { modelName } : {}),
        ...(modelProvider ? { modelProvider } : {}),
        ...(model?.latencyMs !== undefined ? { latencyMs: model.latencyMs } : {}),
        metadata: { stage: "parse", code: result.errors[0]?.code ?? "unknown" },
      });
      return;
    }

    // Model produced parseable output (ok:true OR PREVIEW_UNAVAILABLE).
    if (model) {
      await recordAiModelCallCompleted(scope, {
        modelName: model.modelId,
        ...(modelProvider ? { modelProvider } : {}),
        ...(model.usage ? { inputTokens: model.usage.inputTokens, outputTokens: model.usage.outputTokens } : {}),
        ...(model.latencyMs !== undefined ? { latencyMs: model.latencyMs } : {}),
        metadata: { tier: model.tier, finishReason: model.finishReason ?? "unknown" },
      });
    }

    // 3. Patch events.
    if (!result.ok && result.code === "PREVIEW_UNAVAILABLE") {
      await recordAiPatchOutcome(scope, "validation_failed", {
        validationErrorCode: "PREVIEW_UNAVAILABLE",
      });
      return;
    }
    if (result.ok && result.proposedPatch) {
      await recordAiPatchOutcome(scope, "proposed", {
        metadata: { opCount: result.proposedPatch.operations.length },
      });
      if (result.canApplyLater) {
        await recordAiPatchOutcome(scope, "previewed");
      } else {
        await recordAiPatchOutcome(scope, "validation_failed", {
          validationErrorCode: "PREVIEW_REJECTED",
        });
      }
    }
  } catch {
    // Fail-open: analytics never breaks the AI flow.
  }
}

/**
 * Emit the event for an apply-route outcome (feature: workflow_editing):
 * `ai_patch_applied` on success, `ai_safety_block_triggered` for a
 * confirmation gate, else `ai_patch_validation_failed` (code carries the reason).
 * Fail-open.
 */
export async function recordAiApplyOutcome(
  input: AiRouteEventScope,
  result: ApplyWorkflowPatchResult,
): Promise<void> {
  try {
    const patchId = result.ok ? result.appliedPatchId : input.patchId ?? null;
    const scope: AiEventScope = {
      userId: input.userId,
      feature: "workflow_editing",
      workflowId: input.workflowId ?? null,
      patchId,
    };

    if (result.ok) {
      await recordAiPatchOutcome(scope, "applied", {
        metadata: { opCount: result.appliedOperationCount, riskLevel: result.riskLevel },
      });
      return;
    }
    if (result.code === "CONFIRMATION_REQUIRED") {
      await recordAiSafetyBlock(scope, "confirmation_required");
      return;
    }
    await recordAiPatchOutcome(scope, "validation_failed", {
      validationErrorCode: result.code,
    });
  } catch {
    // Fail-open: analytics never breaks the AI flow.
  }
}
