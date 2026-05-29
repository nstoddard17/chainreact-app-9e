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
import type { NarrowingClassifierResult } from "./narrowingClassifier";

/**
 * Slice 4.AI-34C — outcome of the OpenAI fast-tier model classifier attempt.
 * Drives `PlannerPromptAttribution.fallbackToDeterministic` + `tierRoutingReason`.
 *   - `model_succeeded` — the model classifier ran and produced a result; its
 *     candidates were unioned into narrowing (additive only).
 *   - `model_failed` — the model classifier was attempted but errored / returned
 *     unparseable output; the planner fell back to deterministic narrowing.
 *   - `openai_not_configured` — the model classifier flag is on but
 *     `ENABLE_OPENAI_PROVIDER`/`OPENAI_API_KEY` are missing; deterministic used.
 *   - `model_disabled` — the model classifier flag is off; deterministic used
 *     exactly as AI-31 (NOT a fallback — never attempted).
 */
export type ModelClassifierOutcome =
  | "model_succeeded"
  | "model_failed"
  | "openai_not_configured"
  | "model_disabled";

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
 * Slice 4.AI-24 — minimal snapshot of the user's current builder canvas
 * (pending / unsaved graph) passed alongside the catalog + connected
 * integrations so the planner can reason about what the user has RIGHT NOW.
 * The server-saved `draftDefinition` may lag the canvas (e.g. user deleted
 * nodes locally without saving) — the canvas snapshot is authoritative for
 * planner intent.
 *
 * Deliberately value-free: provider:type pairs + edges only. NO `config`,
 * NO `position`, NO secrets. The planner only needs to know "what is on
 * the canvas" — config values are graph state the planner already proposes
 * via patch operations, never reads from the canvas.
 */
export interface CurrentWorkflowGraphView {
  readonly nodes: ReadonlyArray<{
    readonly id: string;
    readonly kind: "trigger" | "action";
    readonly provider: string;
    readonly type: string;
    /**
     * Slice 4.BUILDER-NODE-IDENTITY-1 — the USER's custom node name when set.
     * Read-only context so the planner can refer to a node by its human label
     * when talking to the user; the `id` is still the only thing patch ops may
     * reference. The planner NEVER writes a displayName.
     */
    readonly displayName?: string;
  }>;
  readonly edges: ReadonlyArray<{
    readonly id: string;
    readonly from: string;
    readonly to: string;
  }>;
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
  /**
   * Slice 4.AI-24 — current builder-canvas snapshot. When supplied, rendered
   * as a `Current workflow on the canvas` section so the planner sees the
   * unsaved local graph (which is the authoritative picture of the user's
   * intent right now). When omitted, the prompt states the canvas is empty
   * — which is the right default for "build a workflow from scratch".
   */
  readonly currentGraph?: CurrentWorkflowGraphView;
  readonly costAwareness?: WorkflowPlanCostAwareness;
  /**
   * Slice 4.AI-31 — the tier the orchestrator plans to use for the
   * model call. Threaded through so `PlannerPromptAttribution` can
   * record `plannerModelTier` (the planner's tier-routing decision)
   * separately from `model.tier` on `PlanModelMetadata` (which is
   * authoritative for what actually ran). Defaults to the
   * workflow_creation feature default (`"strong"`) when omitted.
   */
  readonly plannerTier?: ModelTier;
  /**
   * Slice 4.AI-34C — the OpenAI fast-tier model classifier's result, when it
   * ran successfully (`source: "model"`). Threaded in by the async grounding
   * layer (`buildWorkflowPlanRequestWithAttribution`) since the model call is
   * async and the builder is pure. When present, the builder uses it as the
   * classifier AND unions its valid candidate providers into the deterministic
   * narrowed catalog (ADDITIVE only — never removes a deterministic / explicit
   * / connected / canvas provider). When absent, the builder runs the AI-31
   * deterministic classifier exactly as before. ADVISORY — never authoritative.
   */
  readonly modelClassifier?: NarrowingClassifierResult | null;
  /**
   * Slice 4.AI-34C — outcome of the model-classifier attempt (drives the
   * `fallbackToDeterministic` + `tierRoutingReason` attribution). Absent /
   * `"model_disabled"` reproduces the AI-31 behavior exactly.
   */
  readonly modelClassifierOutcome?: ModelClassifierOutcome;
}

/** Input to the async grounding helper that composes AI-2 then builds the prompt. */
export interface WorkflowPlanRequestInput {
  readonly userId: string;
  readonly userRequest: string;
  /** Tier override; defaults to the `creation` feature's tier. */
  readonly tier?: ModelTier;
  readonly costAwareness?: WorkflowPlanCostAwareness;
  /** Slice 4.AI-24 — current builder-canvas snapshot; see CurrentWorkflowGraphView. */
  readonly currentGraph?: CurrentWorkflowGraphView;
}

/** The AI feature this planner emits requests under (for tier + future events). */
export const WORKFLOW_PLAN_FEATURE: AiFeature = "creation";

// ─── Slice 4.AI-28: prompt packet attribution ────────────────────────────────

/**
 * Stable identifier for the CURRENT planner packet shape. Bump on any
 * change to the `buildWorkflowPlanPrompt` section layout / rule wording /
 * catalog rendering that would invalidate cross-version comparisons in
 * `ai_cost_events`. AI-29 / AI-30 / AI-31 / AI-32 each bump this so cost +
 * quality regressions can be attributed to a specific packet version.
 *
 * AI-29 (2026-05-27) bumped v1 → v2: structured CONTEXT PACKET JSON block
 * + grouped CRITICAL RULES (R1..R8 named groups). Catalog rendering,
 * connected-integrations rendering, current-canvas rendering, patch shape
 * guide, value shape rules, and JSON output rules are unchanged from v1.
 * Every PLANNER_CONSTRAINTS string is preserved verbatim inside its
 * grouped rule block. Rollback to v1 via `ENABLE_STRUCTURED_PROMPT_PACKET=false`.
 *
 * AI-30 (2026-05-27) bumped v2 → v3: deterministic provider narrowing for
 * the catalog (`narrowProvidersForPlan`) plus a narrowing-aware
 * no-substitution rule and an extended CONTEXT PACKET JSON
 * (`catalog.providersTotal` / `catalog.narrowingMode` /
 * `catalog.narrowingReason`). The structured packet shape and rule
 * grouping are otherwise unchanged. Rollback to full-catalog (within v3)
 * via `ENABLE_AI_PROVIDER_NARROWING=false`.
 */
export const PLANNER_PACKET_VERSION_V3 = "workflow-planner-v3";
export const PLANNER_PACKET_VERSION_V2 = "workflow-planner-v2";
export const PLANNER_PACKET_VERSION_V1 = "workflow-planner-v1";
export const PLANNER_PACKET_VERSION = PLANNER_PACKET_VERSION_V3;

/**
 * Slice 4.AI-35D — telemetry for the SEPARATE OpenAI fast-tier intent
 * classifier model call (AI-34C), when it was attempted. Rides the planner
 * attribution channel (the only field that flows uniformly to every
 * `PlanWorkflowResult` shape) so `recordAiPlanOutcome` can emit a distinct
 * `ai_model_call_completed`/`ai_model_call_failed` row for the classifier —
 * closing the AI-COST-INCIDENT-1 telemetry gap (an enabled classifier
 * previously billed OpenAI with no `ai_cost_events` record).
 *
 * Present ONLY when a model call was attempted (`outcome` is `model_succeeded`
 * / `model_failed`). Absent for `model_disabled` / `openai_not_configured`
 * (no call → nothing to record). Carries counts/enums/ids only — NO raw
 * classifier prompt, NO raw model output, NO provider-id arrays.
 */
export interface ClassifierModelCallAttribution {
  /** Vendor model id (e.g. `gpt-4.1-mini`). */
  readonly modelName: string;
  readonly modelProvider: "openai";
  /** True when the model returned a response (regardless of parse success). */
  readonly responded: boolean;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly latencyMs?: number;
  /** Parsed classifier confidence (only when the result parsed). */
  readonly confidence?: "high" | "medium" | "low";
  /** Raw count of provider ids the model named (pre catalog-filter). */
  readonly candidateProviderCount?: number;
  /** Count of those ids that exist in the catalog (post-filter). */
  readonly validProviderCount?: number;
  readonly outcome: ModelClassifierOutcome;
}

/**
 * Slice 4.AI-28 — per-section character attribution + structural counts for
 * one planner prompt. Computed deterministically by
 * `buildWorkflowPlanPromptWithAttribution` from the same sections that ship
 * to the model. **NO secrets, NO raw user text, NO raw catalog content.**
 * Each field is either a non-negative integer or a short version label.
 *
 * Tokens are NOT stored here because (a) the existing `ai_cost_events`
 * metadata sanitizer drops any key matching `/token/i` as defense in depth
 * against accidental access-token leakage, and (b) Anthropic's response
 * already populates the authoritative `inputTokens` on
 * `ai_model_call_completed`. Dashboards can compute per-section token
 * attribution via `inputTokens × (sectionChars / totalPacketChars)` —
 * exact rather than estimated.
 *
 * Chars are exact (`String#length`, UTF-16 code units). Anthropic's
 * tokenization averages ~3.5–4.2 chars/token for English+JSON; the conversion
 * is documented in
 * `docs/slices/phase-4/planner-prompt-packet-audit.md` §M.
 */
export interface PlannerPromptAttribution {
  /** Packet shape version — `PLANNER_PACKET_VERSION`. */
  readonly packetVersion: string;
  /** Total chars across system + user message content. */
  readonly totalPacketChars: number;
  /** Chars in the rendered provider catalog section. */
  readonly catalogChars: number;
  /** Chars in the rendered `Rules:` section (`PLANNER_CONSTRAINTS`). */
  readonly rulesChars: number;
  /** Chars in the rendered connected-integrations section. */
  readonly connectedIntegrationsChars: number;
  /** Chars in the rendered current-canvas section. */
  readonly currentCanvasChars: number;
  /** Chars in the user request message (verbatim user prompt). */
  readonly userRequestChars: number;
  /** Count of providers actually rendered in the catalog (`hasMetadata && (actions || triggers)`). */
  readonly catalogProviderCount: number;
  /** Total action entries rendered across all providers. */
  readonly catalogActionCount: number;
  /** Total trigger entries rendered across all providers. */
  readonly catalogTriggerCount: number;
  /** Total config-field entries (across all actions + triggers in the catalog). */
  readonly catalogFieldCount: number;
  /** Total declared output-field entries (across all actions + triggers in the catalog). */
  readonly catalogOutputFieldCount: number;
  /** Count of connected integrations rendered in the connected-integrations section. */
  readonly connectedIntegrationCount: number;
  /** Count of nodes in the current-canvas snapshot. */
  readonly currentCanvasNodeCount: number;
  /** Count of edges in the current-canvas snapshot. */
  readonly currentCanvasEdgeCount: number;
  // ─── Slice 4.AI-30: provider narrowing attribution ─────────────────────────
  /**
   * Total usable providers in the FULL catalog BEFORE narrowing. Always equal
   * to `catalogProviderCount` when narrowing was skipped. Surfaced separately
   * so dashboards can compute `omitted = total - included` and `narrowing
   * coverage = included / total` without needing the catalog itself. AI-30.
   */
  readonly catalogProvidersTotal: number;
  /**
   * Whether narrowing was enabled for this call. False only when the env
   * flag `ENABLE_AI_PROVIDER_NARROWING=false` short-circuited the helper.
   * Independent of `providerNarrowingMode` — narrowing can be enabled and
   * still fall through to `"full-catalog"` for safety reasons (broad request,
   * complex-canvas-vague-edit, etc.). AI-30.
   */
  readonly providerNarrowingEnabled: boolean;
  /**
   * What the narrowing helper actually did:
   *  - `"narrowed"`: catalog filtered to a subset (cost saved).
   *  - `"full-catalog"`: full catalog included (safety fallback or disabled).
   * AI-30.
   */
  readonly providerNarrowingMode: "narrowed" | "full-catalog";
  /**
   * True when `mode === "full-catalog"` AND it was a deliberate FALLBACK
   * from a real narrowing attempt — i.e. narrowing was enabled but the
   * helper decided narrowing was unsafe for this request. False when
   * `mode === "narrowed"` OR when narrowing was simply disabled by env.
   * Distinguishes "we tried and bailed" from "we never tried." AI-30.
   */
  readonly providerNarrowingFallbackUsed: boolean;
  /**
   * Stable enum reason from {@link NarrowingFallbackReason}. Set when
   * `mode === "full-catalog"`; absent otherwise. AI-30.
   */
  readonly providerNarrowingReason?: string;
  /** Count of providers omitted from the catalog. 0 when full-catalog. AI-30. */
  readonly providerNarrowingOmittedCount: number;
  // ─── Slice 4.AI-31: tier-routing attribution ───────────────────────────────
  /**
   * Tier of the model that produced the plan response. Today always
   * `"strong"` for the workflow_creation feature — see
   * `FEATURE_DEFAULT_TIER` in `core/ai/models.ts`. AI-31.
   */
  readonly plannerModelTier: ModelTier;
  /**
   * Whether a narrowing classifier (deterministic OR model) produced a
   * result for this plan call. `false` only when the classifier env
   * flag is off OR a future model classifier failed and we fell back
   * to deterministic narrowing alone. AI-31.
   */
  readonly classifierUsed: boolean;
  /**
   * Tier of the model used by the classifier. `null` for the AI-31
   * deterministic helper; `"fast"` for a future Haiku-backed classifier
   * (AI-31B). AI-31.
   */
  readonly classifierModelTier: ModelTier | null;
  /**
   * Classifier-assigned confidence in the narrowing decision. `null`
   * when no classifier ran. AI-31.
   */
  readonly classifierConfidence: "high" | "medium" | "low" | null;
  /**
   * Number of providers the classifier suggested (its
   * `candidateProviders` length). `null` when no classifier ran.
   * AI-31.
   */
  readonly classifierProviderCount: number | null;
  /**
   * Number of providers the AI-30 deterministic narrowing helper
   * included (`narrowing.providerIds.size`). Always present —
   * narrowing runs on every plan call. AI-31.
   */
  readonly deterministicProviderCount: number;
  /**
   * Number of providers the planner ACTUALLY shipped to the model in
   * the catalog section. Today equal to `deterministicProviderCount`;
   * may differ when a future model classifier adds providers
   * narrowing missed. AI-31.
   */
  readonly finalProviderCount: number;
  /**
   * True when the classifier failed/threw and we used deterministic
   * narrowing alone. Today always `false` — the deterministic
   * classifier doesn't throw. A future model classifier that times
   * out will flip this to `true` so dashboards can attribute failed
   * classifier calls. AI-31.
   */
  readonly fallbackToDeterministic: boolean;
  /**
   * True when narrowing fell back to the full catalog. Alias for
   * `providerNarrowingFallbackUsed` exposed under the tier-routing
   * name so dashboards can group by routing outcome without
   * disambiguating field names. AI-31.
   */
  readonly fallbackToFullCatalog: boolean;
  /**
   * Short string explaining how the planner-model tier was chosen.
   * Stable enum-like vocabulary:
   *   - `"feature_default_strong"` — workflow_creation default; the
   *     steady-state value today.
   *   - `"feature_default_fast"` — a `fast`-default feature (not
   *     used for plan calls today).
   *   - `"user_override_<tier>"` — caller passed an explicit tier
   *     override.
   *   - `"classifier_disabled"` — classifier env flag off; planner
   *     still uses the feature-default tier.
   *   - `"narrowing_fallback_<reason>"` — narrowing fell back to full
   *     catalog AND the planner stayed on the default tier (today the
   *     only behavior; a future AI-31B may promote/demote here).
   *   - `"classifier_model_succeeded"` — the AI-34C OpenAI fast-tier
   *     classifier ran and its candidates were unioned into narrowing.
   *   - `"classifier_model_failed"` — the model classifier was attempted
   *     but errored / returned unparseable output; deterministic used.
   *   - `"openai_not_configured"` — model-classifier flag on but OpenAI
   *     provider / key missing; deterministic used.
   * AI-31 / AI-34C.
   */
  readonly tierRoutingReason: string;
  /**
   * Slice 4.AI-35D — telemetry for the SEPARATE OpenAI classifier model call,
   * present only when one was attempted. Read by `recordAiPlanOutcome` to emit
   * a distinct classifier `ai_model_call_*` row. NOT folded into the planner
   * row's metadata (the recorder allow-lists planner fields explicitly), so it
   * never pollutes the Anthropic call's attribution.
   */
  readonly classifierModelCall?: ClassifierModelCallAttribution;
}

/**
 * Approximate Anthropic English/JSON tokens from an exact char count.
 * **Heuristic only.** Use the authoritative `inputTokens` from
 * `result.model.usage.inputTokens` for billing comparisons; use this
 * function only for section-attribution where the model API returns a
 * single aggregate count.
 *
 * Anthropic English+JSON averages ~3.7 chars/token; range observed
 * 3.5–4.2. AI-27 measurement: 38,059 estimated vs 36,000 observed → ~6%
 * over-count (conservative). See
 * `docs/slices/phase-4/planner-prompt-packet-audit.md` §M.
 */
export function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.round(chars / 3.7);
}

// ─── Structured model response ───────────────────────────────────────────────

export type PlanConfidence = "high" | "medium" | "low";

export type PlanRequiredUserInputKind =
  | "config_value"
  | "select_integration"
  | "choose_trigger"
  | "variable_reference"
  | "clarification"
  // Slice 4.AI-35 — the user must pick WHICH provider satisfies an ambiguous
  // generic category ("email" → Gmail | Outlook). Carries `category` +
  // `options`; rendered as a choice control. BLOCKS Apply (the node type is
  // ambiguous until resolved), unlike `select_integration`.
  | "provider_choice";

/**
 * Slice 4.AI-35 — whether a required-input entry must be resolved BEFORE the
 * draft patch can be applied to the builder.
 *
 * Apply = create/update the DRAFT workflow graph. Activate = the readiness
 * gate. So a `select_integration` (connect-a-disconnected-provider) requirement
 * is an ACTIVATION concern — it yields a not-ready draft node, not a blocked
 * Apply. Everything else (a missing config value, an ambiguous provider choice,
 * an unresolved trigger/variable/clarification) is needed to form a correct
 * draft and therefore still blocks Apply (preserves the AI-20 safety floor for
 * genuinely-missing values).
 */
export function isApplyBlockingRequiredInputKind(kind: string): boolean {
  return kind !== "select_integration";
}

/**
 * Slice 4.AI-22 — server-enriched metadata that lets the React Agent
 * render an interactive control for the missing field (dropdown for
 * static options, async picker for `optionsSource`, text fallback
 * otherwise). All fields are derived from the live catalog + the
 * patch's node references; the model NEVER fills these — the parser
 * strips any model-emitted values for these keys, and the service
 * enriches the entries via `enrichRequiredUserInputs` after parse.
 *
 * Backward compatible: every field is optional, so the AI-9A route /
 * AI-12 / AI-21 / AI-21B / AI-21C consumers that only read `label` /
 * `kind` / `nodeId` / `field` still work unchanged.
 *
 * No-leak: only display labels, field names, FieldType enum, and the
 * `optionsSource` registry key (`<provider>:<resource>`) are surfaced —
 * never option values from a live resolver, never secret-shaped config,
 * never tokens.
 */
export interface PlanRequiredUserInputMetadata {
  /**
   * Slice 4.AI-35 — for `provider_choice` entries, the generic capability
   * category the user must disambiguate (`"email"` | `"calendar"` |
   * `"drive"` | `"chat"`). Lets the follow-up reconstruction cite the choice
   * ("The email provider is Gmail.") and lets the control label itself.
   * Absent for non-provider-choice entries.
   */
  readonly category?: string;
  /** Provider id this missing field belongs to (e.g. `slack`). Derived from the node's metadata. */
  readonly provider?: string;
  /** Node type within that provider (e.g. `send_channel_message`). */
  readonly nodeType?: string;
  /** Human-readable node display name from ActionMeta / TriggerMeta. */
  readonly nodeLabel?: string;
  /** Human-readable field label from FieldMeta. */
  readonly fieldLabel?: string;
  /** FieldMeta renderer type — `text` / `select` / `combobox` / etc. */
  readonly fieldType?: string;
  /** Multi-select toggle (forwarded from FieldMeta.multiple). */
  readonly multiple?: boolean;
  /** Static-enum options from FieldMeta.options. Empty / absent when the field uses optionsSource or is free-text. */
  readonly options?: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  /** Dynamic options resolver key (e.g. `slack:channels`). Mutually exclusive with `options`. */
  readonly optionsSource?: string;
  /**
   * dependsOn parent field names for the optionsSource resolver. Empty
   * when the resolver has no deps (e.g. `slack:channels`). The control
   * uses this to know which prior staged answers to pass through.
   */
  readonly dependsOn?: ReadonlyArray<string>;
  /** Should the user also be able to type a free-text value? True for text-typeable fields. */
  readonly allowFreeText?: boolean;
  /** FieldMeta placeholder (UX hint only — never used as a default value). */
  readonly placeholder?: string;
}

export interface PlanRequiredUserInput extends PlanRequiredUserInputMetadata {
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
  /**
   * Slice 4.AI-24 — current builder-canvas snapshot from the client (pending
   * / unsaved graph). When omitted the planner gets no Current-workflow
   * section; non-builder callers don't need to supply it. See
   * {@link CurrentWorkflowGraphView} for the value-free shape.
   */
  readonly currentGraph?: CurrentWorkflowGraphView;
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
  /**
   * Slice 4.AI-28 — per-section character + structural attribution for the
   * prompt that was sent to the model. Present whenever a request was built
   * (so always on success; on failure too when the failure stage is `model`
   * / `parse` / `preview`). Surfaced into `ai_cost_events` by
   * `recordAiPlanOutcome`.
   */
  readonly prompt?: PlannerPromptAttribution;
  /** Always true — this service is read-only and never applies. */
  readonly noMutation: true;
}

export interface PlanWorkflowFailure {
  readonly ok: false;
  readonly code: PlanWorkflowFailureCode;
  readonly message: string;
  /** Present once the model was called (model/parse failures). */
  readonly model?: PlanModelMetadata;
  /**
   * Slice 4.AI-28 — per-section attribution. Always populated on failure
   * because the request was built before the model call.
   */
  readonly prompt?: PlannerPromptAttribution;
  readonly errors: readonly PlanWorkflowError[];
  readonly noMutation: true;
}

export type PlanWorkflowResult = PlanWorkflowSuccess | PlanWorkflowFailure;
