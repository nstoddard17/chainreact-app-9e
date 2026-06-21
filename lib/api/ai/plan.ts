/**
 * Builder AI plan / apply / complete client (Slice 4.AI-11 → AI-35B; extracted
 * from the monolithic `lib/api/ai.ts` in Slice 4.AI-REPAIR-CLEANUP-1 — refactor
 * only, no behavior change).
 *
 * ⚠️ DEPRECATED IN THE VISIBLE BUILDER (HERMES-AGENT-LEGACY-AI-ROUTE-AUDIT, 2026-06-21).
 * `planWorkflow` / `completePlan` are imported ONLY by the legacy `BuilderAiPanel` chat
 * (`useBuilderAi`), which is no longer mounted — the visible builder AI is Hermes guidance
 * (`requestWorkflowGuidance` → `/api/accounts/[id]/ai/workflow-guidance`). Do NOT import
 * `planWorkflow` into any newly-mounted UI. `applyWorkflowPatch` is the exception: it stays
 * LIVE because the run-results `RunResultsRepairBlock` (mounted) still uses it.
 *
 * Per project-structure-and-module-boundaries.md §4/§5: client code calls this
 * module (via the `@/lib/api/ai` barrel), never the server services or `fetch()`
 * from a component. These types are CLIENT-OWNED views of the (already-sanitized)
 * route responses — the client may not import the `@/services/**` result types,
 * and treats `proposedPatch` as OPAQUE (forwarded to the apply route, never
 * inspected or rendered).
 *
 *   - POST /api/workflows/[id]/ai/plan     → preview-only plan (AI-9A).
 *   - POST /api/workflows/[id]/ai/apply    → confirmed apply (AI-9B).
 *   - POST /api/workflows/[id]/ai/complete → deterministic required-input
 *     completion, no model call (AI-35B).
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

export interface PlanWorkflowRequest {
  readonly prompt: string;
  readonly modelTier?: "fast" | "strong";
  /** Slice 4.AI-24 — current builder-canvas snapshot. See {@link CurrentGraphSnapshot}. */
  readonly currentGraph?: CurrentGraphSnapshot;
  /**
   * Slice 4.AI-35D — value-free telemetry tag distinguishing the user's first
   * prompt (`initial_plan`) from a follow-up answer (`follow_up`, which today
   * re-runs the FULL planner) so the dev cost guard + `ai_cost_events.metadata`
   * can attribute repeat planner calls. Purely observability — the planner
   * behavior is identical regardless of the value.
   */
  readonly interactionKind?: "initial_plan" | "follow_up" | "retry" | "unknown";
}

export interface ApplyWorkflowPatchRequest {
  readonly patch: AiOpaquePatch;
  readonly confirmation?: AiApplyConfirmation;
}

export async function planWorkflow(
  workflowId: string,
  request: PlanWorkflowRequest,
): Promise<AiPlanResult> {
  return postStructured<AiPlanResult>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/plan`,
    request,
  );
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

/**
 * Slice 4.AI-35B — deterministic required-input completion (NO model call).
 *
 * When the user fills the EXACT required fields the planner already identified,
 * the client posts the staged answers + the pending patch here; the server
 * drops the values into the patch config (or builds an `updateNodeConfig` for an
 * existing-canvas node), previews, and returns an apply-ready plan — without a
 * model call. When the answers can't be safely mapped the server returns a
 * `NEEDS_REPLAN` signal and the caller falls back to {@link planWorkflow}.
 *
 * `proposedPatch` is the OPAQUE patch from the prior plan result (same value the
 * apply route accepts). `carryRequiredInput` preserves non-blocking entries
 * (e.g. `select_integration`) in the completed result.
 */
export interface CompletePlanRequest {
  readonly proposedPatch?: AiOpaquePatch | null;
  readonly answers: ReadonlyArray<{
    /**
     * Target node id + field. BOTH optional (Slice 4.AI-35F): a bare answer for
     * a rendered required text control with no node identity is forwarded
     * without a target, and the server infers the unique missing required text
     * field from the pending patch.
     */
    readonly nodeId?: string;
    readonly field?: string;
    readonly value: string;
    readonly multiple?: boolean;
  }>;
  readonly currentGraph?: CurrentGraphSnapshot;
  readonly intentSummary?: string;
  readonly carryRequiredInput?: readonly AiRequiredUserInput[];
}

/** Server signal that deterministic completion isn't safe — caller re-plans. */
export interface CompletePlanNeedsReplan {
  readonly ok: false;
  readonly code: "NEEDS_REPLAN";
  readonly reason: string;
}

/** Either an apply-ready completed plan (same shape as a plan success) or a re-plan signal. */
export type CompletePlanResponse = AiPlanSuccess | CompletePlanNeedsReplan;

export async function completePlan(
  workflowId: string,
  request: CompletePlanRequest,
): Promise<CompletePlanResponse> {
  return postStructured<CompletePlanResponse>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/complete`,
    request,
  );
}
