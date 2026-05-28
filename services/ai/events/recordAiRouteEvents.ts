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
import type {
  PlannerPromptAttribution,
  PlanWorkflowResult,
} from "@/services/ai/planner";
import type { RepairSuggestionResult } from "@/services/ai/repair";

export interface AiRouteEventScope {
  readonly userId: string;
  readonly workflowId?: string | null;
  /** The request's patch id (apply route) — used for failure events. */
  readonly patchId?: string | null;
}

export interface AiRepairRouteEventScope {
  readonly userId: string;
  readonly workflowId: string;
  readonly workflowRunId: string;
}

/** Registry provider for a model id (analytics dimension); undefined if unknown. */
function providerOf(modelId: string | undefined): string | undefined {
  return modelId ? getModelById(modelId)?.provider : undefined;
}

/**
 * Slice 4.AI-28 — fold per-section attribution into the metadata blob
 * `recordAiModelCallCompleted` / `recordAiModelCallFailed` already write.
 * Each key is intentionally free of the `sanitizeAiEventMetadata`
 * denylist patterns (`/token|secret|password|authorization|prompt|config|body|raw/i`)
 * so the sanitizer passes them through. Tokens-per-section are NOT stored
 * — dashboards compute them as `inputTokens × (sectionChars / totalPacketChars)`
 * against the authoritative top-level `inputTokens` column. See
 * `docs/slices/phase-4/planner-prompt-packet-audit.md` §I.
 *
 * Returns `{}` when no attribution is available (legacy paths). Never
 * throws; every value is a primitive number or string.
 */
function promptAttributionMetadata(
  prompt: PlannerPromptAttribution | undefined,
): Record<string, unknown> {
  if (!prompt) return {};
  return {
    catalogChars: prompt.catalogChars,
    rulesChars: prompt.rulesChars,
    connectedIntegrationsChars: prompt.connectedIntegrationsChars,
    currentCanvasChars: prompt.currentCanvasChars,
    userRequestChars: prompt.userRequestChars,
    totalPacketChars: prompt.totalPacketChars,
    catalogProviderCount: prompt.catalogProviderCount,
    catalogActionCount: prompt.catalogActionCount,
    catalogTriggerCount: prompt.catalogTriggerCount,
    catalogFieldCount: prompt.catalogFieldCount,
    catalogOutputFieldCount: prompt.catalogOutputFieldCount,
    connectedIntegrationCount: prompt.connectedIntegrationCount,
    currentCanvasNodeCount: prompt.currentCanvasNodeCount,
    currentCanvasEdgeCount: prompt.currentCanvasEdgeCount,
    // Slice 4.AI-30 — narrowing fields. Counts + enum reasons only; no
    // provider ids (the catalog itself already ships the names to the
    // model — the metadata channel stays compact + sanitizer-safe).
    catalogProvidersTotal: prompt.catalogProvidersTotal,
    providerNarrowingEnabled: prompt.providerNarrowingEnabled,
    providerNarrowingMode: prompt.providerNarrowingMode,
    providerNarrowingFallbackUsed: prompt.providerNarrowingFallbackUsed,
    providerNarrowingOmittedCount: prompt.providerNarrowingOmittedCount,
    ...(prompt.providerNarrowingReason
      ? { providerNarrowingReason: prompt.providerNarrowingReason }
      : {}),
  };
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
    // Slice 4.AI-28 — per-section attribution. Present on every result
    // produced after the request was built (so all PlanWorkflowResult paths
    // except an exception thrown before `buildWorkflowPlanRequestWithAttribution`
    // resolves). Folded into the model-call metadata blob; the top-level
    // `promptVersion` column is set from `prompt.packetVersion`.
    const prompt = result.prompt;
    const promptVersion = prompt?.packetVersion;
    const promptMeta = promptAttributionMetadata(prompt);

    // 2. Model event. A model-API failure and an unparseable response are both
    //    "no usable model output" — recorded as a failed call, distinguished by
    //    metadata.stage.
    if (!result.ok && result.code === "MODEL_FAILED") {
      await recordAiModelCallFailed(scope, {
        ...(modelName ? { modelName } : {}),
        ...(modelProvider ? { modelProvider } : {}),
        ...(model?.latencyMs !== undefined ? { latencyMs: model.latencyMs } : {}),
        metadata: {
          stage: "model",
          code: result.errors[0]?.code ?? "unknown",
          ...(promptVersion ? { packetVersion: promptVersion } : {}),
          ...promptMeta,
        },
      });
      return;
    }
    if (!result.ok && result.code === "PARSE_FAILED") {
      await recordAiModelCallFailed(scope, {
        ...(modelName ? { modelName } : {}),
        ...(modelProvider ? { modelProvider } : {}),
        ...(model?.latencyMs !== undefined ? { latencyMs: model.latencyMs } : {}),
        metadata: {
          stage: "parse",
          code: result.errors[0]?.code ?? "unknown",
          ...(promptVersion ? { packetVersion: promptVersion } : {}),
          ...promptMeta,
        },
      });
      return;
    }

    // Model produced parseable output (ok:true OR PREVIEW_UNAVAILABLE).
    if (model) {
      await recordAiModelCallCompleted(scope, {
        modelName: model.modelId,
        ...(modelProvider ? { modelProvider } : {}),
        ...(promptVersion ? { promptVersion } : {}),
        ...(model.usage ? { inputTokens: model.usage.inputTokens, outputTokens: model.usage.outputTokens } : {}),
        ...(model.latencyMs !== undefined ? { latencyMs: model.latencyMs } : {}),
        metadata: {
          tier: model.tier,
          finishReason: model.finishReason ?? "unknown",
          ...(promptVersion ? { packetVersion: promptVersion } : {}),
          ...promptMeta,
        },
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

/**
 * Emit the event sequence for a repair-route outcome (Slice 4.AI-13).
 *
 * AI-7's repair service is deterministic (no model call) and read-only, so the
 * emitted shape is narrower than plan/apply — no model events. The sequence is:
 *
 *   1. `ai_interaction_started` (funnel denominator; feature `workflow_repair`,
 *      scope carries the failed `workflowRunId`).
 *   2. Patch events for the repairability outcome:
 *      - `repairable` (patch proposed AND AI-5 preview validated) →
 *        `ai_patch_proposed` then `ai_patch_previewed`.
 *      - `repairable` but `reasonCode === "FAILED_PREVIEW"` (the strategy
 *        proposed a patch but preview rejected it; outcome is downgraded) →
 *        `ai_patch_validation_failed` with the code.
 *      - `needsUserInput` → `ai_safety_block_triggered` with reason
 *        `needs_user_input` (so the funnel can distinguish "we asked the
 *        user" from "we found nothing safe").
 *      - `noSafeRepair` → `ai_safety_block_triggered` with the reasonCode
 *        (e.g. `disconnected_integration`, `billing_limit`).
 *   3. NOT_FOUND / READ_FAILED service failures emit a single
 *      `ai_patch_validation_failed` with the failure code so dashboards can
 *      count repair calls that never reached classification.
 *
 * FAIL-OPEN. No raw classification text / config values / variable values are
 * persisted — only ids, codes, counts. The repository's existing
 * `sanitizeAiEventMetadata` runs on every metadata blob as defense in depth.
 */
export async function recordAiRepairOutcome(
  input: AiRepairRouteEventScope,
  result: RepairSuggestionResult,
): Promise<void> {
  try {
    const patchId = result.ok ? result.proposedPatch?.patchId ?? null : null;
    const scope: AiEventScope = {
      userId: input.userId,
      feature: "workflow_repair",
      workflowId: input.workflowId,
      workflowRunId: input.workflowRunId,
      patchId,
    };

    if (!result.ok) {
      // Service-level failure (NOT_FOUND / READ_FAILED) — never reached
      // classification. Surface as a validation_failed so the funnel can
      // count "repair requested but couldn't read".
      await recordAiPatchOutcome(scope, "validation_failed", {
        validationErrorCode: result.code,
      });
      return;
    }

    // 1. The repair interaction itself (funnel denominator).
    await recordAiCostEvent({ ...scope, eventType: "ai_interaction_started" });

    // 2. Outcome.
    if (result.repairability === "repairable" && result.proposedPatch) {
      await recordAiPatchOutcome(scope, "proposed", {
        metadata: {
          opCount: result.proposedPatch.operations.length,
          reasonCode: result.reasonCode,
        },
      });
      await recordAiPatchOutcome(scope, "previewed", {
        metadata: { reasonCode: result.reasonCode },
      });
      return;
    }

    if (result.reasonCode === "FAILED_PREVIEW") {
      // The strategy produced operations but AI-5 preview rejected them; the
      // service downgrades to noSafeRepair. Surface as validation_failed so
      // the funnel can distinguish it from "no deterministic repair found".
      await recordAiPatchOutcome(scope, "validation_failed", {
        validationErrorCode: result.reasonCode,
      });
      return;
    }

    if (result.repairability === "needsUserInput") {
      await recordAiSafetyBlock(scope, "needs_user_input", {
        reasonCode: result.reasonCode,
      });
      return;
    }

    // repairability === "noSafeRepair"
    await recordAiSafetyBlock(scope, "no_safe_repair", {
      reasonCode: result.reasonCode,
    });
  } catch {
    // Fail-open: analytics never breaks the AI flow.
  }
}
