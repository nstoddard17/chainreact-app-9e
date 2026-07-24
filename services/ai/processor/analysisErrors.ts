/**
 * Typed throwables for the AI action layer (AI-PROVIDER-5 CS-5).
 *
 * Handlers THROW and let the engine classify (authoring rule 8 — no
 * `{success:false}` envelopes). The engine's classifier reads `err.name`
 * rather than importing error classes, to avoid an import cycle between
 * `services/execution` and the provider layers — so the `name` values
 * below are load-bearing, not cosmetic:
 *
 *   - `AiTransientError.name === "TimeoutError"` → `TRANSIENT_PROVIDER_ERROR`
 *     (a retry-worthy stop: gateway timeout, 429, 5xx). This is the mapping
 *     the plan specifies in §7; the name is the engine's wire, the class is
 *     what CS-5 code reads.
 *   - everything else → `HANDLER_FAILED` with the message shown in run
 *     history.
 *
 * No-leak: every message here is caller-safe — document text, extracted
 * values, prompts, gateway bodies, tokens, and account/workflow ids never
 * appear. `ExtractionValidationError` names FIELDS only, never values.
 */

/**
 * A retry-worthy provider stop. `name` is `"TimeoutError"` on purpose —
 * see the module header; changing it silently downgrades these failures to
 * `HANDLER_FAILED` in run history.
 */
export class AiTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/** The configured document input is unusable (wrong shape, empty, unsupported). */
export class DocumentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentInputError";
  }
}

/** The configured data input is unusable (wrong shape, empty, too large). */
export class TransformInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransformInputError";
  }
}

/**
 * The configured destination cannot be turned into an output contract
 * (missing, unknown, AI-targeted, or nothing mappable on it).
 */
export class DestinationResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DestinationResolutionError";
  }
}

/** The model's answer did not satisfy the author's declared schema. */
export class ExtractionValidationError extends Error {
  /** Field NAMES / issue labels only — never extracted values. */
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    const detail = issues.length > 0 ? ` (${issues.join("; ")})` : "";
    super(`The AI result did not match the fields you asked for${detail}.`);
    this.name = "ExtractionValidationError";
    this.issues = issues;
  }
}

/** A non-retryable refusal from the shared pipeline (disabled, credits, tier). */
export class AiActionRefusedError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "AiActionRefusedError";
    this.reason = reason;
  }
}

/**
 * The account is out of AI credits (AI-PROVIDER-6 CS-6, plan §7).
 *
 * A SUBCLASS of `AiActionRefusedError` on purpose: every caller that already
 * treats a refusal as a refusal keeps working, while the engine's name-based
 * classifier can single this one out as `AI_CREDITS_EXHAUSTED` — distinct from
 * `PLAN_FEATURE_REQUIRED` (plan gating) and from a generic `HANDLER_FAILED`.
 * Run history can then say "you're out of AI credits" and point at billing
 * instead of at the step's configuration.
 */
export class AiCreditsExhaustedError extends AiActionRefusedError {
  constructor(message: string) {
    super("credits_refused", message);
    this.name = "AiCreditsExhaustedError";
  }
}

/**
 * Map a `preflight_refused` outcome onto the right throwable. Shared by both
 * AI action orchestrators so "out of credits" can never mean one thing in
 * Analyze Document and another in Transform Data.
 */
export function refusalError(outcome: {
  reason: string;
  message: string;
  gate?: { ok: boolean; reason?: string } | undefined;
}): AiActionRefusedError {
  if (
    outcome.reason === "credits_refused" &&
    outcome.gate?.ok === false &&
    outcome.gate.reason === "insufficient_ai_credits"
  ) {
    return new AiCreditsExhaustedError(outcome.message);
  }
  return new AiActionRefusedError(outcome.reason, outcome.message);
}
