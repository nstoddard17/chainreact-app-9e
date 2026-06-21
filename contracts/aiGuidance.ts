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

/** Why guidance could not be produced. All safe, non-leaky enums. */
export type GuidanceUnavailableCode =
  | "PROVIDER_DISABLED"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "TIMEOUT"
  | "INVALID_RESPONSE";

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
