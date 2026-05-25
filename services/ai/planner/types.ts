/**
 * Types for the workflow planner (Slices 4.AI-8A + 4.AI-8B).
 *
 * AI-8A laid the SAFE boundary: a deterministic prompt builder grounded only in
 * real registry metadata, plus a strict parser/validator for the model's
 * structured response. AI-8B adds the first model-backed planning service
 * (`planWorkflowFromPromptForAI`): build request → call an injected model client
 * → parse → run the proposed patch through the deterministic AI-3/AI-5 preview.
 * Neither slice creates, mutates, persists, or applies any workflow (apply is
 * AI-6); AI-8A itself makes no live model calls.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §4/§6.
 */

import type {
  AiFeature,
  ModelClient,
  ModelFinishReason,
  ModelTier,
  ModelTokenUsage,
} from "@/core/ai/modelTypes";
import type { ConnectedIntegrationView } from "@/services/ai/tools/integrations";
import type { ProviderCatalogView } from "@/services/ai/tools/providerCatalog";
import type { PatchPreviewResult } from "@/services/ai/preview/types";
import type { WorkflowPatch } from "@/services/workflows/patch/types";

// ─── Prompt-builder input ────────────────────────────────────────────────────

/**
 * Optional deterministic task-cost / risk awareness the caller already computed
 * (e.g. plan limits, a per-run task estimate). Surfaced to the model as context
 * so it prefers cheaper, lower-risk plans — never authoritative.
 */
export interface WorkflowPlanCostAwareness {
  /** Rough per-run task estimate hint, if the caller has one. */
  readonly estimatedTasksPerRunHint?: number;
  /** Short, value-free notes (e.g. "user is near their monthly task cap"). */
  readonly notes?: readonly string[];
}

/**
 * Pure, fully-resolved input to {@link buildWorkflowPlanPrompt}. The catalog +
 * connected integrations are the AI-2 grounding views; passing them in keeps the
 * prompt builder deterministic and testable without touching repos.
 */
export interface WorkflowPlanPromptInput {
  readonly userRequest: string;
  /** Compact provider/action/trigger catalog from AI-2 — the ONLY allowed nodes. */
  readonly catalog: ProviderCatalogView;
  /** The caller's connected integrations (redacted availability view), or empty. */
  readonly connectedIntegrations: readonly ConnectedIntegrationView[];
  readonly costAwareness?: WorkflowPlanCostAwareness;
}

/** Input to the async grounding helper that composes AI-2 then builds the prompt. */
export interface WorkflowPlanRequestInput {
  readonly userId: string;
  readonly userRequest: string;
  /** Tier override; defaults to the `creation` feature's tier. */
  readonly tier?: ModelTier;
  readonly costAwareness?: WorkflowPlanCostAwareness;
}

/** The AI feature this planner emits requests under (for tier + future events). */
export const WORKFLOW_PLAN_FEATURE: AiFeature = "creation";

// ─── Structured model response ───────────────────────────────────────────────

export type PlanConfidence = "high" | "medium" | "low";

export type PlanRequiredUserInputKind =
  | "config_value"
  | "select_integration"
  | "choose_trigger"
  | "variable_reference"
  | "clarification";

export interface PlanRequiredUserInput {
  readonly label: string;
  readonly nodeId?: string;
  readonly field?: string;
  readonly kind: PlanRequiredUserInputKind;
}

/**
 * The contract the model must return (a single JSON object). AI-8A parses +
 * validates this; it does NOT preview or apply `proposedPatch` (that is AI-8B,
 * which runs it through the AI-3 validator + AI-5 preview before anything is
 * usable). `proposedPatch` is null when the model needs user input or judges the
 * request unsupported.
 */
export interface WorkflowPlanResponse {
  readonly intentSummary: string;
  readonly assumptions: readonly string[];
  readonly requiredUserInput: readonly PlanRequiredUserInput[];
  /** Structurally valid against the AI-3 schema, or null. NEVER auto-applied here. */
  readonly proposedPatch: WorkflowPatch | null;
  /** Model self-rating — captured, never trusted for safety decisions. */
  readonly confidence: PlanConfidence;
  readonly safetyNotes: readonly string[];
  /** Parts of the request the model could not satisfy with available metadata. */
  readonly unsupportedRequests: readonly string[];
}

// ─── Parse result ────────────────────────────────────────────────────────────

export type PlanParseErrorCode =
  | "EMPTY_RESPONSE" // blank / whitespace-only model output
  | "NOT_JSON" // not parseable as JSON (incl. prose around the JSON)
  | "INVALID_SHAPE" // JSON parsed but failed the response schema
  | "INVALID_PATCH" // proposedPatch present but failed the AI-3 schema
  | "SECRET_IN_RESPONSE"; // a literal secret-keyed value appeared (refused)

export interface ParseWorkflowPlanSuccess {
  readonly ok: true;
  readonly response: WorkflowPlanResponse;
}

export interface ParseWorkflowPlanFailure {
  readonly ok: false;
  readonly code: PlanParseErrorCode;
  /** Caller-safe message — never echoes the offending secret value. */
  readonly message: string;
}

export type ParseWorkflowPlanResult =
  | ParseWorkflowPlanSuccess
  | ParseWorkflowPlanFailure;

// ─── AI-8B: model-backed plan proposal + preview ─────────────────────────────
//
// `planWorkflowFromPromptForAI` connects the AI-8A contract to a model client:
// build grounded request → call model → parse → reconcile patch revision →
// run AI-5 preview. It NEVER applies, NEVER mutates a workflow, and NEVER
// persists model output. Apply stays in AI-6.

export interface PlanWorkflowFromPromptInput {
  readonly userId: string;
  readonly workflowId: string;
  readonly prompt: string;
  /** Injected model client. Defaults to the NOT_CONFIGURED client (fails safe). */
  readonly modelClient?: ModelClient;
  readonly modelTier?: ModelTier;
  readonly feature?: AiFeature;
}

/** Model-call metadata surfaced on every plan result (deterministic, safe). */
export interface PlanModelMetadata {
  readonly modelId: string;
  readonly tier: ModelTier;
  readonly feature: AiFeature;
  readonly finishReason?: ModelFinishReason;
  readonly usage?: ModelTokenUsage;
  readonly latencyMs?: number;
}

/** Which pipeline stage produced a hard failure. */
export type PlanWorkflowStage = "model" | "parse" | "preview";

export interface PlanWorkflowError {
  readonly stage: PlanWorkflowStage;
  /** The underlying code (model failureCode / parser code / AI-2 tool code). */
  readonly code: string;
  /** Caller-safe message — never echoes secrets / raw config values. */
  readonly message: string;
}

export type PlanWorkflowFailureCode =
  | "MODEL_FAILED" // model client returned a failure (incl. NOT_CONFIGURED)
  | "PARSE_FAILED" // response could not be parsed into a valid plan
  | "PREVIEW_UNAVAILABLE"; // workflow missing / preview tool could not run

export interface PlanWorkflowSuccess {
  readonly ok: true;
  readonly intentSummary: string;
  readonly assumptions: readonly string[];
  readonly requiredUserInput: readonly PlanRequiredUserInput[];
  readonly unsupportedRequests: readonly string[];
  readonly safetyNotes: readonly string[];
  /**
   * The reconciled patch (workflowId + baseRevision set by this service). Present
   * only when the model proposed one. NEVER applied here.
   */
  readonly proposedPatch?: WorkflowPatch;
  /** The AI-5 preview of `proposedPatch`, when one was proposed and previewed. */
  readonly preview?: PatchPreviewResult;
  /** True only when a patch exists AND the deterministic preview validated it. */
  readonly canApplyLater: boolean;
  /** Set when a patch exists but the preview rejected it — why it's not apply-ready. */
  readonly blockedReason?: string;
  readonly model: PlanModelMetadata;
  /** Always true — this service is read-only and never applies. */
  readonly noMutation: true;
}

export interface PlanWorkflowFailure {
  readonly ok: false;
  readonly code: PlanWorkflowFailureCode;
  readonly message: string;
  /** Present once the model was called (model/parse failures). */
  readonly model?: PlanModelMetadata;
  readonly errors: readonly PlanWorkflowError[];
  readonly noMutation: true;
}

export type PlanWorkflowResult = PlanWorkflowSuccess | PlanWorkflowFailure;
