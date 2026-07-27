/**
 * Provider-neutral AI workflow-guidance contracts (HOSTED-HERMES-GUIDANCE-FOUNDATION-1).
 *
 * The schema that crosses (or WOULD cross) the ChainReact ↔ external-guidance-brain boundary
 * — Nous Hermes being the first intended hosted provider, but these types name NOTHING
 * Hermes-specific. A future hosted brain is ONE `WorkflowGuidanceProvider` adapter behind
 * this contract; the noop provider is the default.
 *
 * HARD PRIVACY INVARIANT — the request that leaves ChainReact carries ONLY de-identified,
 * generalized workflow SHAPE (node kind/provider/type + edge topology) + a guidance kind +
 * safe finding CODES. It deliberately has NO field for:
 *   - raw node `config` values, secrets, tokens, API keys, credentials,
 *   - user PII / emails / recipients / message bodies,
 *   - real workflow / account / user / node ids (nodes are referenced by opaque in-request
 *     handles like "n0"; the real-id map stays ChainReact-side, never sent),
 *   - model prompts / chain-of-thought / raw model output.
 * The sanitizer (`services/ai-guidance/sanitizeWorkflowForGuidance`) is the enforcement point;
 * these types make the unsafe fields unrepresentable.
 *
 * ADVISORY INVARIANT — guidance is ADVICE. A response may SUGGEST operation kinds, but the
 * deterministic ChainReact validator + apply pipeline remain the only authority and the only
 * mutation path. Nothing here applies, saves, runs, or mutates a workflow.
 */

export const AI_GUIDANCE_SCHEMA_VERSION = 1 as const;

/** The kind of guidance requested. Closed set — extend deliberately. */
export type GuidanceKind = "workflow_design" | "repair_suggestion" | "explain_structure";

/**
 * A de-identified node: capability SHAPE only. `kind`/`provider`/`type` are registry enums
 * (what the step CAN do), never user data. There is intentionally no `config`, `label`, or
 * real id field.
 */
export interface GeneralizedWorkflowNode {
  /** Stable in-request handle (e.g. "n0"). NOT the real workflow node id. */
  readonly ref: string;
  readonly kind: string;
  readonly provider: string;
  readonly type: string;
}

/** Topology only — references nodes by their in-request `ref`. No labels / branch values. */
export interface GeneralizedWorkflowEdge {
  readonly fromRef: string;
  readonly toRef: string;
}

export interface GeneralizedWorkflow {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodes: readonly GeneralizedWorkflowNode[];
  readonly edges: readonly GeneralizedWorkflowEdge[];
}

/** The cross-boundary request. NOTE: no account/user/workflow id, no config, no free text. */
export interface WorkflowGuidanceRequest {
  readonly schemaVersion: number;
  readonly guidanceKind: GuidanceKind;
  readonly workflow: GeneralizedWorkflow;
  /** SAFE diagnostic/finding CODES only (registry enums) — never messages or values. */
  readonly findingCodes?: readonly string[];
}

/** One advisory suggestion. `suggestedOperationKinds` are HINTS — never concrete operations. */
export interface WorkflowGuidanceSuggestion {
  readonly title: string;
  readonly detail: string;
  readonly suggestedOperationKinds?: readonly string[];
  readonly confidence?: number;
}

export interface WorkflowGuidanceResponse {
  readonly schemaVersion: number;
  readonly guidanceKind: GuidanceKind;
  /** Which provider produced it (e.g. "hermes" / "noop"). */
  readonly providerId: string;
  readonly suggestions: readonly WorkflowGuidanceSuggestion[];
  /** Opaque, safe model tag (e.g. a model name) — never raw model output / chain-of-thought. */
  readonly modelTag?: string;
}

/**
 * Why guidance could not be produced. All safe, non-leaky enums.
 *
 * `CANCELLED` (REACT-AGENT-RETRY-BACKOFF-1) is distinct from `TIMEOUT` on purpose: the caller went
 * away (browser navigation, the user hit stop, the rail unmounted), which is not a fault and must
 * never be retried, never be logged as an incident, and never be confused with our own deadline
 * firing. Keeping them separate is what lets the retry policy refuse both for different reasons.
 */
export type GuidanceUnavailableCode =
  | "PROVIDER_DISABLED"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "TIMEOUT"
  | "CANCELLED"
  | "INVALID_RESPONSE";

/**
 * REACT-AGENT-RETRY-BACKOFF-1 — why a bounded automatic retry happened. Safe, closed enum: it is
 * logged, audited, and crosses module boundaries, so it can only ever name a transport/status class.
 */
export type GuidanceRetryReason = "network_error" | "status_502" | "status_503" | "status_429";

/** Why a retry did NOT happen. `timeout` and `insufficient_budget` are very different signals. */
export type GuidanceRetrySkipReason =
  | "not_retryable"
  | "timeout"
  | "cancelled"
  | "slow_failure"
  | "insufficient_budget"
  | "retry_after_too_long"
  | "attempts_exhausted";

/**
 * REACT-AGENT-RETRY-BACKOFF-1 — safe attempt/retry telemetry for ONE logical user submission.
 *
 * Lives in contracts (not in the gateway client) because the route, the capability runner, and the
 * audit recorder all read it, and the route is structurally forbidden from importing the server-only
 * gateway client. Numbers and closed enums ONLY — by construction it cannot carry a prompt, a model
 * response, a provider message, a header, a token, or any user content.
 */
export interface GuidanceAttemptTelemetry {
  /** The ONE logical request id shared by both attempts (null when the caller supplied none). */
  readonly requestId: string | null;
  /** Total provider attempts made for this submission (1 or 2 — never more). */
  readonly attempts: number;
  readonly retried: boolean;
  readonly retryReason: GuidanceRetryReason | null;
  /** Present whenever the first attempt failed and was deliberately not retried. */
  readonly retrySkippedReason: GuidanceRetrySkipReason | null;
  /** Actual jittered wait before attempt 2 (0 when no retry). Counted against the same budget. */
  readonly backoffMs: number;
  /** Wall-clock across the whole logical call, including backoff. */
  readonly elapsedMs: number;
  /** Budget left when the retry decision was taken (null when the first attempt succeeded). */
  readonly remainingBudgetMsAtDecision: number | null;
  /**
   * REACT-AGENT-LATENCY-AND-PROMPT-SIZE-1 — size of the assembled prompt actually sent (characters
   * and a chars/4 token estimate). SAFE: counts only, never content. Optional (older callers).
   */
  readonly promptChars?: number;
  readonly estPromptTokens?: number;
}

/** Discriminated guidance outcome. `reason` (when present) is a safe tag, never a raw error. */
export type GuidanceResult =
  | { readonly ok: true; readonly response: WorkflowGuidanceResponse }
  | { readonly ok: false; readonly code: GuidanceUnavailableCode; readonly reason?: string };

/**
 * HERMES-AGENT-BUILDER-RAIL-CHAT-MODE — a single sanitized turn of the builder rail's session-scoped
 * conversation. PLAIN TEXT ONLY (the user's words or Hermes's prior advisory prose). It carries NO
 * config values, secrets, tokens, credential ids, provider account ids, or raw workflow JSON — the
 * workflow shape still travels only through the sanitized `WorkflowGuidanceRequest`. Conversation is
 * REQUEST-SCOPED: it is sent per request to give Hermes recent context and is NOT durably stored.
 */
export type GuidanceConversationRole = "user" | "assistant";

export interface GuidanceConversationTurn {
  readonly role: GuidanceConversationRole;
  readonly text: string;
}

/** Bounds for the optional recent-conversation context (enforced server-side at the trust boundary). */
export const MAX_GUIDANCE_CONVERSATION_TURNS = 8 as const;
export const MAX_GUIDANCE_CONVERSATION_TURN_TEXT = 1_000 as const;

/**
 * REACT-AGENT-TEMPLATE-MATCH-2 — a SAFE official-template recommendation surfaced by the
 * workflow-guidance route's deterministic matcher (no LLM). It carries ONLY public-catalog facts +
 * the deterministic score/confidence/reasons — the SAME no-leak surface as the marketplace card.
 *
 * HARD INVARIANT: this shape is intentionally incapable of carrying a raw template definition, a
 * node `config` value, a `{{...}}` variable expression, or any account / user / credential /
 * integration / provider-RESOURCE id. `templateId` is the PUBLIC marketplace template id (already
 * client-reachable via the use/preview routes); `provider`/`type` are public catalog ids (e.g.
 * `slack` / `send_channel_message`), never a channel/board/list/resource id.
 */
export type GuidanceTemplateMatchConfidence = "high" | "medium" | "low";

/** One safe preview-chain step (public catalog ids + a humanized display label). */
export interface GuidanceTemplateStep {
  readonly kind: "trigger" | "action";
  readonly provider: string;
  readonly type: string;
  readonly label: string;
}

export interface GuidanceOfficialTemplateMatch {
  readonly templateId: string;
  readonly name: string;
  readonly description: string | null;
  /** Deterministic integer relevance score (higher = stronger). */
  readonly score: number;
  readonly confidence: GuidanceTemplateMatchConfidence;
  /** Human-readable, safe reasons (provider + humanized step labels only — never a token/id). */
  readonly reasons: readonly string[];
  /** Always true on this route — the matcher reads only the official catalog. */
  readonly isOfficial: true;
  /** Required-app provider ids (public catalog ids; `native` excluded). */
  readonly providers: readonly string[];
  readonly providerLabels: readonly string[];
  readonly triggerKind: "manual" | "scheduled" | "app";
  readonly category: string;
  readonly categoryLabel: string;
  readonly nodeCount: number;
  readonly stepCount: number;
  /** Ordered preview chain (trigger → actions), capped for display. */
  readonly steps: readonly GuidanceTemplateStep[];
}
