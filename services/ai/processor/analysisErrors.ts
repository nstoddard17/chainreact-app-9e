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
