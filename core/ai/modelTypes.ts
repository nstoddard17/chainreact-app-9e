/**
 * Provider-agnostic model boundary types (Slice 4.AI-8A).
 *
 * The FIRST model-backed AI infrastructure for V2. This module defines the
 * shapes only — config lives in `./models`, the client factories in
 * `./modelClient`. There are NO live model calls anywhere in AI-8A; a
 * NOT_CONFIGURED adapter and an in-memory mock are the only implementations.
 *
 * Purity: `core/ai/*` may import only from `contracts/` (eslint-enforced). These
 * types depend on nothing — they are the seam the future planner / ReAct agent
 * (AI-8B+) calls so V2 never trusts raw model text and never wires a provider
 * SDK directly into business logic.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §4.1.
 */

/** Capability tiers. `fast` = cheap/low-latency; `strong` = highest quality. */
export type ModelTier = "fast" | "strong";

/** Concrete model vendors. Real adapters are deferred to AI-8B/AI-8C. */
export type ModelProvider = "anthropic" | "openai";

/**
 * AI feature names — used to pick a default tier and, later, to tag `ai_events`
 * rows (§16 observability). Mirrors the plan's feature taxonomy. Kept narrow on
 * purpose; `template_*` features are added when templates land (TEMPLATE-AI-*).
 */
export type AiFeature =
  | "creation"
  | "editing"
  | "repair"
  | "explanation"
  | "run_analysis"
  | "data_qa"
  | "discovery";

export type ModelRole = "system" | "user" | "assistant";

export interface ModelMessage {
  readonly role: ModelRole;
  /** Plain text. NEVER contains tokens, secrets, PII, or raw run-data values. */
  readonly content: string;
}

/**
 * One model generation request. `generateStructuredJson` always asks the model
 * for a single JSON object; the caller parses + validates the response itself
 * (e.g. `parseWorkflowPlanResponse`) — the boundary never trusts the text.
 */
export interface ModelGenerateInput {
  readonly feature: AiFeature;
  /** Explicit tier override. When omitted the client uses the feature default. */
  readonly tier?: ModelTier;
  readonly messages: readonly ModelMessage[];
  /** Caller cap on response size. Clamped to the model's `maxOutputTokens`. */
  readonly maxOutputTokens?: number;
  /**
   * Redacted enums / ids / counts only (for future `ai_events` correlation).
   * MUST NOT carry secrets, raw prompts, or resolved config values.
   */
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface ModelTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export type ModelFinishReason =
  | "stop" // model finished normally
  | "length" // hit the output token cap
  | "content_filter" // provider safety filter tripped
  | "error" // provider-side error finish
  | "unknown";

/**
 * Closed set of model-call failure codes. `NOT_CONFIGURED` is the AI-8A default
 * (no adapter wired); AI-8C's real adapter + runtime factory emit the rest.
 * Callers can exhaustively switch without a later type change.
 */
export type ModelFailureCode =
  | "NOT_CONFIGURED" // no provider adapter / API key wired (fail-safe default)
  | "CONFIGURATION_ERROR" // config points at a provider with no implemented adapter
  | "TIMEOUT" // exceeded the budget timeout (request aborted)
  | "RATE_LIMITED" // provider 429
  | "PROVIDER_ERROR" // provider non-2xx (4xx/5xx), sanitized
  | "NETWORK_ERROR" // fetch threw (DNS / connection / non-abort)
  | "INVALID_RESPONSE" // 2xx but body could not be parsed into the expected shape
  | "EMPTY_RESPONSE" // 2xx, parsed, but no text content
  | "INVALID_INPUT"; // malformed request (e.g. empty messages)

export interface ModelSuccess {
  readonly ok: true;
  readonly modelId: string;
  readonly feature: AiFeature;
  /** Raw model text — to be parsed + validated by the caller, never trusted. */
  readonly text: string;
  readonly finishReason: ModelFinishReason;
  readonly usage?: ModelTokenUsage;
  readonly latencyMs?: number;
}

export interface ModelFailure {
  readonly ok: false;
  readonly modelId: string;
  readonly feature: AiFeature;
  readonly failureCode: ModelFailureCode;
  /** Caller-safe message. MUST NOT contain tokens, secrets, PII, or raw bodies. */
  readonly message: string;
  /** Whether a retry could plausibly succeed (429 / 5xx / network / timeout). */
  readonly retryable?: boolean;
  readonly latencyMs?: number;
}

export type ModelResult = ModelSuccess | ModelFailure;

/**
 * The provider-agnostic model client. One method in AI-8A. Implementations:
 *   - `createNotConfiguredModelClient()` — always fails NOT_CONFIGURED.
 *   - `createMockModelClient()` — deterministic in-memory client for tests.
 * A real OpenAI/Anthropic adapter is a later slice and lives OUTSIDE `core/`
 * (it performs network I/O, which `core/` purity forbids).
 */
export interface ModelClient {
  generateStructuredJson(input: ModelGenerateInput): Promise<ModelResult>;
}
