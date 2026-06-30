/**
 * Builder AI apply client (Slice 4.AI-11; extracted from the monolithic
 * `lib/api/ai.ts` in Slice 4.AI-REPAIR-CLEANUP-1).
 *
 * HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT Phase 2 (2026-06-21): the dead `planWorkflow`
 * (`…/ai/plan`) and `completePlan` (`…/ai/complete`) client functions + their routes were
 * REMOVED — the visible builder AI is Hermes guidance (`requestWorkflowGuidance` →
 * `/api/accounts/[id]/ai/workflow-guidance`). Phase 3 (2026-06-21): the now-fully-dead
 * `AiPlan*` / `AiModelMeta` / `AiRequiredUserInput` / `CurrentGraphSnapshot` data types were
 * pruned alongside the deleted planner service. The ONLY live export here is
 * `applyWorkflowPatch` → `POST /api/workflows/[id]/ai/apply`, used by the run-results
 * `RunResultsRepairBlock` for explicit repair apply. The `AiPreview` / `AiApply*` types stay
 * (live, consumed by `applyWorkflowPatch` + the repair contract in `runRepair.ts`).
 *
 * Per project-structure-and-module-boundaries.md §4/§5: client code calls this module (via the
 * `@/lib/api/ai` barrel), never the server services or `fetch()` from a component. It treats
 * `proposedPatch` as OPAQUE (forwarded to the apply route, never inspected or rendered).
 */

import { postStructured, type AiOpaquePatch } from "./shared";

/** Value-free description of one proposed change (from AI-5; never config values). */
export interface AiChangeSummary {
  readonly op: string;
  readonly description: string;
  readonly nodeId?: string;
  readonly edgeId?: string;
}

export interface AiPreviewValidationIssue {
  readonly code: string;
  readonly message: string;
}

/** Why a change is risky (from AI-3, recomputed deterministically; value-free). */
export interface AiRiskReason {
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
}

/** The subset of the AI-5 preview the Builder renders. Extra fields are ignored. */
export interface AiPreview {
  readonly ok: boolean;
  readonly riskLevel: string;
  readonly requiresConfirmation: boolean;
  readonly riskReasons?: readonly AiRiskReason[];
  readonly affectedNodeIds?: readonly string[];
  readonly affectedEdgeIds?: readonly string[];
  readonly changes?: readonly AiChangeSummary[];
  readonly validation?: {
    readonly ok: boolean;
    readonly errors: readonly AiPreviewValidationIssue[];
    readonly warnings: readonly AiPreviewValidationIssue[];
  };
  readonly taskCostEstimate?: { readonly estimatedTasksPerRun: number };
  readonly userFacingSummaryText?: string;
  readonly currentRevision?: string;
  readonly blockedReason?: string;
}

export interface AiApplyConfirmation {
  readonly confirmed: boolean;
  readonly acceptedRiskLevel?: string;
  readonly acceptedAt?: string;
}

export interface AiApplySuccess {
  readonly ok: true;
  readonly workflowId: string;
  readonly appliedPatchId: string;
  readonly appliedOperationCount: number;
  readonly riskLevel: string;
  readonly requiresConfirmation: boolean;
  readonly updatedAt: string;
  readonly summaryText: string;
  /**
   * AGENT-CHANGE-HISTORY-1 (eval linkage) — the ai_cost_events row id recorded for this apply,
   * when the route managed to write one. Used to link a repair's change-history item to its
   * observability event. Optional / best-effort (analytics is fail-open).
   */
  readonly aiCostEventId?: string;
}

export interface AiApplyFailure {
  readonly ok: false;
  /** CONFIRMATION_REQUIRED | STALE_PATCH | PATCH_INVALID | VALIDATION_FAILED | UNSUPPORTED_OPERATION | UPDATE_FAILED | NOT_FOUND */
  readonly code: string;
  readonly message: string;
  readonly errors?: readonly AiPreviewValidationIssue[];
}

export type AiApplyResult = AiApplySuccess | AiApplyFailure;

export interface ApplyWorkflowPatchRequest {
  readonly patch: AiOpaquePatch;
  readonly confirmation?: AiApplyConfirmation;
}

export async function applyWorkflowPatch(
  workflowId: string,
  request: ApplyWorkflowPatchRequest,
): Promise<AiApplyResult> {
  return postStructured<AiApplyResult>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/apply`,
    request,
  );
}

