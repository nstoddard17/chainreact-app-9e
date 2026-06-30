/**
 * AI route event emission (Slice 4.AI-10).
 *
 * The EMISSION layer that connects the live AI plan/apply flows (AI-9A/9B) to
 * the EXISTING AI observability ledger (`ai_cost_events`, COST-6) via the
 * existing recorder helpers (`services/billing/aiCostEvents`). AI-10 adds NO new
 * table and NO new recorder/sanitizer — COST-6/COST-7 already own the ledger,
 * `sanitizeAiEventMetadata`, and `ownerAiStats` analytics. This module only maps
 * an `ApplyWorkflowPatchResult` / `RepairSuggestionResult` onto the existing
 * event taxonomy. (The legacy plan-route recorder was retired with the planner
 * service in HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT Phase 3.)
 *
 * FAIL-OPEN: analytics must NEVER break the AI flow. Every function swallows all
 * errors (the recorder may throw on an insert failure / missing service-role
 * env). It also never persists raw prompts/completions/config — it forwards only
 * ids, codes, counts, model names, token counts, and latency; the recorder
 * sanitizes `metadata` again as defense in depth.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §16.
 */

import {
  recordAiCostEvent,
  recordAiPatchOutcome,
  recordAiSafetyBlock,
  type AiEventScope,
} from "@/services/billing/aiCostEvents";
import type { ApplyWorkflowPatchResult } from "@/services/ai/apply";
import type { RepairSuggestionResult } from "@/services/ai/repair";
import { logAiCostDebug } from "./aiCostDebug";

export interface AiRouteEventScope {
  /** Cost owner — the account the AI usage is billed to (4.ACCOUNT-MODEL-9d). */
  readonly accountId: string;
  /** Actor — the user who drove the AI interaction (provenance, not owner). */
  readonly userId: string;
  readonly workflowId?: string | null;
  /** The request's patch id (apply route) — used for failure events. */
  readonly patchId?: string | null;
}

export interface AiRepairRouteEventScope {
  /** Cost owner — the account the AI usage is billed to (4.ACCOUNT-MODEL-9d). */
  readonly accountId: string;
  /** Actor — the user who drove the AI interaction (provenance, not owner). */
  readonly userId: string;
  readonly workflowId: string;
  readonly workflowRunId: string;
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
): Promise<string | null> {
  try {
    const patchId = result.ok ? result.appliedPatchId : input.patchId ?? null;
    const scope: AiEventScope = {
      accountId: input.accountId,
      userId: input.userId,
      feature: "workflow_editing",
      workflowId: input.workflowId ?? null,
      patchId,
    };

    // Slice 4.AI-35D — apply has no model call (deterministic), so the dev
    // line just surfaces the patch outcome (no tokens / no cost). Gated +
    // fail-open.
    logAiCostDebug({
      feature: "workflow_editing",
      eventType: result.ok ? "ai_patch_applied" : "ai_patch_validation_failed",
      patchOutcome: result.ok ? "applied" : "validation_failed",
      ...(input.workflowId ? { workflowId: input.workflowId } : {}),
    });

    if (result.ok) {
      // AGENT-CHANGE-HISTORY-1 (eval linkage) — return the applied event id so the route can hand it
      // back; a repair's change-history item links to it. Best-effort (fail-open below).
      return await recordAiPatchOutcome(scope, "applied", {
        metadata: { opCount: result.appliedOperationCount, riskLevel: result.riskLevel },
      });
    }
    if (result.code === "CONFIRMATION_REQUIRED") {
      await recordAiSafetyBlock(scope, "confirmation_required");
      return null;
    }
    await recordAiPatchOutcome(scope, "validation_failed", {
      validationErrorCode: result.code,
    });
    return null;
  } catch {
    // Fail-open: analytics never breaks the AI flow.
    return null;
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
      accountId: input.accountId,
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
