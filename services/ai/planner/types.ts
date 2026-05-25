/**
 * Types for the workflow-plan prompt/result contract (Slice 4.AI-8A).
 *
 * AI-8 will eventually create workflows from a natural-language prompt. AI-8A
 * lays the SAFE boundary first: a deterministic prompt builder grounded only in
 * real registry metadata, plus a strict parser/validator for the model's
 * structured response. AI-8A does NOT create, mutate, preview, or apply any
 * workflow, and makes NO live model calls.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §4/§6.
 */

import type { AiFeature, ModelTier } from "@/core/ai/modelTypes";
import type { ConnectedIntegrationView } from "@/services/ai/tools/integrations";
import type { ProviderCatalogView } from "@/services/ai/tools/providerCatalog";
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
