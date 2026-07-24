/**
 * Typed client for the Suggest-fields API (AI-PROVIDER-7 CS-7).
 *
 * Per project-structure-and-module-boundaries.md §5: feature hooks call this
 * module, never `fetch()` directly. The error `code` union mirrors the route's
 * arms value-for-value; the duplication is deliberate (the structural boundary
 * test forbids `lib/api/` importing `app/` or `services/`), so adding a code
 * means touching both files.
 */

/** Stable, finite error union. KEEP IN SYNC with the suggest-schema route. */
export type SchemaSuggestionErrorCode =
  /** Signed out, or not a member of this account. */
  | "UNAUTHENTICATED"
  /** The workflow or the step no longer exists (or isn't visible). */
  | "NOT_FOUND"
  | "NODE_NOT_FOUND"
  /** No sample to read yet — the message says what to do about it. */
  | "NO_SAMPLE"
  /** A sample existed but couldn't be read (wrong file type, no text, …). */
  | "SAMPLE_UNREADABLE"
  /** Account is out of AI credits. */
  | "AI_CREDITS_EXHAUSTED"
  /** Feature disabled, provider failure, or a malformed proposal — retryable. */
  | "SUGGESTIONS_UNAVAILABLE"
  | "UNKNOWN";

/** One proposed field. Mirrors `UserSchemaFieldSpec` (contracts/aiProcessing). */
export interface SuggestedSchemaField {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "date" | "currency";
  readonly required?: boolean;
  readonly description?: string;
}

export interface SchemaSuggestionSuccess {
  readonly ok: true;
  readonly schema: { readonly fields: readonly SuggestedSchemaField[] };
  /** Display name of the sampled document, for the confirmation copy. */
  readonly sourceName: string;
  readonly truncated: boolean;
  readonly sampleSource: "config_literal" | "latest_run";
}

export interface SchemaSuggestionFailure {
  readonly ok: false;
  readonly code: SchemaSuggestionErrorCode;
  readonly message: string;
}

export type SchemaSuggestionResponse =
  | SchemaSuggestionSuccess
  | SchemaSuggestionFailure;

export interface SuggestSchemaArgs {
  readonly workflowId: string;
  readonly nodeId: string;
  /** The node field holding the document/data input (meta `sampleSourceField`). */
  readonly sampleSourceField: string;
  readonly instructions?: string;
  readonly signal?: AbortSignal;
}

const GENERIC_FAILURE =
  "ChainReact couldn't suggest fields just now. Try again in a moment.";

function isErrorCode(value: unknown): value is SchemaSuggestionErrorCode {
  return (
    value === "UNAUTHENTICATED" ||
    value === "NOT_FOUND" ||
    value === "NODE_NOT_FOUND" ||
    value === "NO_SAMPLE" ||
    value === "SAMPLE_UNREADABLE" ||
    value === "AI_CREDITS_EXHAUSTED" ||
    value === "SUGGESTIONS_UNAVAILABLE" ||
    value === "UNKNOWN"
  );
}

/**
 * Ask for a proposed schema. NEVER throws for an expected failure — every arm
 * (including a transport error or a non-JSON body) normalizes into the typed
 * `ok: false` result so the editor can render one message and a Retry.
 * Re-throws only an `AbortError`, which the caller intentionally caused.
 */
export async function suggestSchema(
  args: SuggestSchemaArgs,
): Promise<SchemaSuggestionResponse> {
  let response: Response;
  try {
    response = await fetch(
      `/api/workflows/${encodeURIComponent(args.workflowId)}/ai/suggest-schema`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: args.nodeId,
          sampleSourceField: args.sampleSourceField,
          ...(args.instructions ? { instructions: args.instructions } : {}),
        }),
        ...(args.signal ? { signal: args.signal } : {}),
      },
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { ok: false, code: "SUGGESTIONS_UNAVAILABLE", message: GENERIC_FAILURE };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok && body && typeof body === "object" && (body as { ok?: unknown }).ok === true) {
    return body as SchemaSuggestionSuccess;
  }

  const raw = (body ?? {}) as { code?: unknown; message?: unknown; error?: unknown };
  const code = isErrorCode(raw.code)
    ? raw.code
    : response.status === 401 || response.status === 403
      ? "UNAUTHENTICATED"
      : response.status === 404
        ? "NOT_FOUND"
        : "UNKNOWN";
  const message =
    typeof raw.message === "string" && raw.message.length > 0
      ? raw.message
      : typeof raw.error === "string" && raw.error.length > 0
        ? raw.error
        : GENERIC_FAILURE;
  return { ok: false, code, message };
}
