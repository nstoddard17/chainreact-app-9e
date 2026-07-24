import type {
  AiProcessLimits,
  DocumentAnalysisMode,
  DocumentTextPayload,
  UserDefinedSchema,
} from "@/contracts/aiProcessing";
import type { ModelTier } from "@/core/ai/modelTypes";

/**
 * The ChainReact AI processor boundary (AI-PROVIDER-2 CS-2).
 *
 * One task-generic client interface every AI action calls through —
 * workflow handlers never know which vendor/model served a request. Two
 * implementations satisfy it (Hermes gateway / first-party model client),
 * kept behaviorally symmetric by sharing `requestShapes.ts` +
 * `responseSchemas.ts`.
 *
 * Contract rules:
 *   - `process()` NEVER throws for expected external failures (disabled,
 *     unconfigured, timeout, 429/5xx, refusal, malformed reply) — those
 *     normalize into the typed `AiProcessResult`. Programmer errors may
 *     still throw.
 *   - Failure `message`s are caller-safe: no prompts, document text,
 *     extracted values, tokens, account/workflow ids, or raw bodies.
 *   - `payload` stays `unknown` at this boundary — the caller re-validates
 *     with its strict schema (delivery contract, not a trust boundary).
 */

// ─── Requests (discriminated by task) ────────────────────────────────────────

export interface AnalyzeDocumentProcessRequest {
  readonly task: "analyze_document";
  readonly mode: DocumentAnalysisMode;
  /** ≤ INSTRUCTIONS_MAX_CHARS; optional per-mode focus guidance. */
  readonly instructions?: string;
  /** answer_questions mode only. */
  readonly question?: string;
  readonly document: DocumentTextPayload;
  /** extract_fields / extract_rows: the user-declared schema. */
  readonly schema?: UserDefinedSchema;
  /** classify: candidate labels (+ whether "Other" is allowed). */
  readonly labels?: readonly string[];
  readonly allowOtherLabel?: boolean;
  readonly limits: AiProcessLimits;
}

export interface TransformDataProcessRequest {
  readonly task: "transform_data";
  readonly instructions?: string;
  /** Serialized source data (≤ 1 MiB enforced by the orchestrator). */
  readonly inputJson: string;
  /** Destination schema (custom-defined or derived from an action's meta). */
  readonly schema: UserDefinedSchema;
  readonly outputShape: "rows" | "record";
  /**
   * Rich destination-action metadata (labels, helpText, static options,
   * defaults). PRODUCT metadata only — never user data, tokens, or account
   * state. Advisory context; `outputSchema` stays the enforced contract.
   */
  readonly destinationContext?: Readonly<Record<string, unknown>>;
  readonly limits: AiProcessLimits;
}

export interface SuggestSchemaProcessRequest {
  readonly task: "suggest_schema";
  readonly instructions?: string;
  readonly document: DocumentTextPayload;
  readonly limits: AiProcessLimits;
}

export type AiProcessRequest =
  | AnalyzeDocumentProcessRequest
  | TransformDataProcessRequest
  | SuggestSchemaProcessRequest;

// ─── Results ─────────────────────────────────────────────────────────────────

export interface AiProcessorUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export type AiProcessorFailureCode =
  | "DISABLED" // flag off — no call attempted
  | "NOT_CONFIGURED" // flag on but env incomplete / invalid
  | "TIMEOUT" // aborted at deadline (retryable)
  | "RATE_LIMITED" // provider/gateway 429 (retryable)
  | "PROVIDER_ERROR" // non-2xx / gateway ok:false (usually retryable)
  | "INVALID_RESPONSE" // 2xx but envelope/JSON/schema malformed
  | "INPUT_TOO_LARGE" // request exceeds transport/provider limits
  | "CONTENT_REFUSED"; // safety refusal

export type AiProcessResult =
  | {
      readonly ok: true;
      /** Raw parsed result object. Caller MUST re-validate (strict Zod). */
      readonly payload: unknown;
      /** Telemetry only — NEVER authoritative for billing. */
      readonly usage?: AiProcessorUsage;
      /** What actually served the call (ledger attribution). */
      readonly modelTag: string;
      readonly source: "gateway" | "first_party";
    }
  | {
      readonly ok: false;
      readonly code: AiProcessorFailureCode;
      readonly retryable: boolean;
      /** Caller-safe. No content, ids, tokens, or raw bodies. */
      readonly message: string;
    };

export interface AiProcessorClient {
  process(request: AiProcessRequest): Promise<AiProcessResult>;
}

// ─── Routing ─────────────────────────────────────────────────────────────────

export type AiProcessorProvider = "gateway" | "first_party";

/**
 * Resolved route for one call. `modelHint` is internal-processor contract
 * only (a tier/model suggestion for the first-party path) — it never
 * reaches workflow-facing code; the model actually used is reported back
 * through `modelTag`.
 */
export interface ModelRoute {
  readonly provider: AiProcessorProvider;
  readonly tier: ModelTier;
  readonly modelHint?: string;
}
