/**
 * Builder AI apply client (Slice 4.AI-11; extracted from the monolithic
 * `lib/api/ai.ts` in Slice 4.AI-REPAIR-CLEANUP-1).
 *
 * HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT Phase 2 (2026-06-21): the dead `planWorkflow`
 * (`…/ai/plan`) and `completePlan` (`…/ai/complete`) client functions + their routes were
 * REMOVED — the visible builder AI is Hermes guidance (`requestWorkflowGuidance` →
 * `/api/accounts/[id]/ai/workflow-guidance`). The ONLY live export here is
 * `applyWorkflowPatch` → `POST /api/workflows/[id]/ai/apply`, used by the run-results
 * `RunResultsRepairBlock` for explicit repair apply. The `AiPreview` / `AiApply*` types stay
 * (live, consumed by `applyWorkflowPatch` + the repair contract in `runRepair.ts`); the
 * remaining `AiPlan*` data types are inert contract types pending the Phase 3 services cleanup.
 *
 * Per project-structure-and-module-boundaries.md §4/§5: client code calls this module (via the
 * `@/lib/api/ai` barrel), never the server services or `fetch()` from a component. It treats
 * `proposedPatch` as OPAQUE (forwarded to the apply route, never inspected or rendered).
 */

import { postStructured, type AiOpaquePatch } from "./shared";

/**
 * Slice 4.AI-22 — optional server-enriched metadata so the React Agent
 * can render an interactive control per missing field (dropdown / async
 * picker / text fallback). All fields are optional; the existing
 * `label` + `kind` + `nodeId` + `field` consumers from AI-11 → AI-21C
 * still work unchanged.
 *
 * No-leak: these fields carry only display labels, FieldType enums,
 * static option `{label, value}` pairs declared in metadata, and the
 * `optionsSource` registry key (e.g. `slack:channels`). Live resolver
 * results, secrets, tokens, and raw config are never embedded here.
 */
export interface AiRequiredUserInput {
  readonly label: string;
  readonly nodeId?: string;
  readonly field?: string;
  readonly kind: string;
  /**
   * Slice 4.AI-35 — for `provider_choice` entries, the ambiguous capability
   * category (`"email"` | `"calendar"` | `"drive"` | `"chat"`). Lets the
   * control label itself + the follow-up cite the choice ("The email provider
   * is Gmail."). Absent for other entries.
   */
  readonly category?: string;
  /** Provider id (e.g. `slack`) — derived server-side from the patch's node metadata. */
  readonly provider?: string;
  /** Node type within the provider (e.g. `send_channel_message`). */
  readonly nodeType?: string;
  /** Human-readable node display name. */
  readonly nodeLabel?: string;
  /** Human-readable field label. */
  readonly fieldLabel?: string;
  /** FieldMeta renderer type — `text` / `select` / `combobox` / `textarea` / etc. */
  readonly fieldType?: string;
  /** Multi-select toggle (forwarded from FieldMeta.multiple). */
  readonly multiple?: boolean;
  /** Static-enum options. Mutually exclusive with `optionsSource`. */
  readonly options?: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  /** Dynamic options resolver key, e.g. `slack:channels`. */
  readonly optionsSource?: string;
  /** dependsOn parent field names for the optionsSource resolver. */
  readonly dependsOn?: ReadonlyArray<string>;
  /** Whether the user can type a free-text value instead of picking. */
  readonly allowFreeText?: boolean;
  /** FieldMeta placeholder — UX hint only. */
  readonly placeholder?: string;
}

export interface AiModelMeta {
  readonly modelId: string;
  readonly tier: string;
  readonly feature: string;
  readonly finishReason?: string;
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number };
  readonly latencyMs?: number;
}

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

export interface AiPlanSuccess {
  readonly ok: true;
  readonly intentSummary: string;
  readonly assumptions: readonly string[];
  readonly requiredUserInput: readonly AiRequiredUserInput[];
  readonly unsupportedRequests: readonly string[];
  readonly safetyNotes: readonly string[];
  readonly proposedPatch?: AiOpaquePatch;
  readonly preview?: AiPreview;
  readonly canApplyLater: boolean;
  readonly blockedReason?: string;
  readonly model: AiModelMeta;
}

export interface AiPlanFailure {
  readonly ok: false;
  /** MODEL_FAILED | PARSE_FAILED | PREVIEW_UNAVAILABLE | AI_CREDITS_EXHAUSTED */
  readonly code: string;
  readonly message: string;
  readonly model?: AiModelMeta;
  readonly errors: readonly { readonly stage: string; readonly code: string; readonly message: string }[];
}

export type AiPlanResult = AiPlanSuccess | AiPlanFailure;

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
}

export interface AiApplyFailure {
  readonly ok: false;
  /** CONFIRMATION_REQUIRED | STALE_PATCH | PATCH_INVALID | VALIDATION_FAILED | UNSUPPORTED_OPERATION | UPDATE_FAILED | NOT_FOUND */
  readonly code: string;
  readonly message: string;
  readonly errors?: readonly AiPreviewValidationIssue[];
}

export type AiApplyResult = AiApplySuccess | AiApplyFailure;

/**
 * Slice 4.AI-24 — value-free snapshot of the user's current builder canvas
 * (pending / unsaved). Sent with every plan request so the planner sees
 * what the user has RIGHT NOW (the server-saved `draftDefinition` may
 * lag — e.g. user deleted nodes locally without saving). Deliberately
 * minimal: provider:type pairs + edges only. NO config, NO position, NO
 * secrets.
 */
export interface CurrentGraphSnapshot {
  readonly nodes: ReadonlyArray<{
    readonly id: string;
    readonly kind: "trigger" | "action";
    readonly provider: string;
    readonly type: string;
    /**
     * Slice 4.BUILDER-NODE-IDENTITY-1 — the user's custom node name when set.
     * Read-only context for the planner (shown next to the opaque id); the
     * planner references nodes by `id`, never this. Omitted when unnamed.
     */
    readonly displayName?: string;
  }>;
  readonly edges: ReadonlyArray<{
    readonly id: string;
    readonly from: string;
    readonly to: string;
  }>;
}

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

