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
  | "discovery"
  // AI-PROVIDER-3 (CS-3) — the ChainReact AI provider's runtime capabilities.
  // These three names are deliberately IDENTICAL in `AiCostFeature`
  // (repositories/aiCostEvents) so one key drives the model call, the credit
  // charge, and the ledger row. `AiProviderFeature` in
  // services/ai/processor/aiActionRegistry is their compile-time intersection.
  | "document_analysis"
  | "data_transform"
  | "schema_suggestion";

export type ModelRole = "system" | "user" | "assistant";

export interface ModelMessage {
  readonly role: ModelRole;
  /** Plain text. NEVER contains tokens, secrets, PII, or raw run-data values. */
  readonly content: string;
}

/**
 * A provider-agnostic "force the model to emit a single JSON object matching
 * this schema" descriptor (Slice 4.AI-19).
 *
 * Anthropic 4.x flatly refuses assistant-message JSON prefill (AI-12C
 * regression), so prompt-only JSON enforcement is unreliable for Sonnet 4.6 +
 * Haiku 4.5 in production. The supported alternative is forced tool-use: send
 * a single tool with this input_schema, force `tool_choice` to that tool, and
 * read the structured object out of the response's `tool_use.input` block.
 *
 * `inputSchema` is treated as a JSON Schema document (Draft 2020-12 subset)
 * by the Anthropic adapter — kept opaque here so future provider adapters can
 * translate it on their own terms. The caller MUST still re-validate the
 * resulting JSON against its strict domain schema (Zod / WorkflowPatchSchema /
 * etc.) — the tool-use mechanism is a delivery contract, not a trust boundary.
 *
 * No-leak: this object is sent with the request body. It MUST NOT contain
 * secrets, API keys, or user data. Names + descriptions are part of the prompt
 * the model receives.
 */
export interface ModelResponseTool {
  /** Tool name — model uses this id to identify the call (e.g. propose_workflow_plan). */
  readonly name: string;
  /** Short description rendered to the model. NO secrets / user data. */
  readonly description: string;
  /** JSON Schema document describing the tool's input shape. */
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

/**
 * One model generation request. `generateStructuredJson` always asks the model
 * for a single JSON object; the caller parses + validates the response itself
 * (e.g. `parseWorkflowPlanResponse`) — the boundary never trusts the text.
 *
 * When `responseTool` is set, providers that support tool-use (e.g. Anthropic)
 * are expected to force the model to call that single tool and return the
 * tool's `input` as the response. Providers that don't support tool-use, the
 * NOT_CONFIGURED client, and the in-memory mock IGNORE the field and behave
 * exactly as before — making the new path additive and safe.
 */
export interface ModelGenerateInput {
  readonly feature: AiFeature;
  /** Explicit tier override. When omitted the client uses the feature default. */
  readonly tier?: ModelTier;
  readonly messages: readonly ModelMessage[];
  /** Caller cap on response size. Clamped to the model's `maxOutputTokens`. */
  readonly maxOutputTokens?: number;
  /**
   * Forced structured-output descriptor (Slice 4.AI-19). Supported adapters
   * MUST coerce the model into emitting a single tool_use call whose `input`
   * matches this schema; the adapter returns the stringified input as
   * {@link ModelSuccess.text} so existing strict parsers stay the source of
   * truth. Optional for backward compatibility.
   */
  readonly responseTool?: ModelResponseTool;
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
