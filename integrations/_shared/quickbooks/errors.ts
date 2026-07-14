/**
 * Typed QuickBooks Online API errors — QUICKBOOKS-1.
 *
 * Mirrors `_shared/typeform/errors.ts` / `_shared/asana/errors.ts`: the
 * shared `_request` helper maps HTTP statuses to these classes so action
 * handlers, option resolvers, and the webhook enrichment layer can branch
 * on `instanceof` without parsing message strings. 401/403 are NOT here —
 * they map to the cross-provider `Unauthorized401Error` /
 * `InsufficientScopeError` from `services/oauth/refreshAndRetry`.
 *
 * `intuit_tid` capture: Intuit stamps every Accounting-API response with an
 * `intuit_tid` header — a transaction/correlation id that Intuit support asks
 * for when diagnosing a failing call. It is a bare opaque id (no PII, no token
 * material), so it is safe to record in internal troubleshooting logs and on
 * error metadata. The QB-owned error classes below carry it in `intuitTid`;
 * `logQuickbooksApiError` writes the sanitized troubleshooting line. It is NOT
 * put in any user-facing message (see `QuickbooksApiError`) and is NEVER paired
 * with the Authorization header, tokens, verifier secrets, or the raw body.
 */

/** Intuit's response-header name for the transaction/correlation id. */
export const INTUIT_TID_HEADER = "intuit_tid";

/**
 * Read Intuit's `intuit_tid` correlation id from a response's headers.
 * Returns null when absent/blank. Header lookup is case-insensitive.
 */
export function readIntuitTid(res: { headers: Headers }): string | null {
  const tid = res.headers.get(INTUIT_TID_HEADER);
  return typeof tid === "string" && tid.length > 0 ? tid : null;
}

/**
 * Sanitized troubleshooting log for a failed QuickBooks API call. Emits ONLY
 * the correlation id + coarse request coordinates (method, path, status) —
 * never the Authorization header, access token, webhook verifier token, or the
 * raw provider body. `console.error(JSON.stringify(...))` mirrors the webhook
 * enrichment layer's structured count-only logging.
 */
export function logQuickbooksApiError(input: {
  method: string;
  path: string;
  status: number;
  intuitTid: string | null;
}): void {
  console.error(
    JSON.stringify({
      event: "quickbooks.api.error",
      method: input.method,
      path: input.path,
      status: input.status,
      intuitTid: input.intuitTid,
    }),
  );
}

/** Provider returned 404 for the named resource. */
export class NotFoundError extends Error {
  readonly resource: string;
  /** Intuit `intuit_tid` correlation id for the failing response, if present. */
  readonly intuitTid: string | null;
  constructor(resource: string, detail?: string, intuitTid: string | null = null) {
    super(
      `QuickBooks resource not found: ${resource}${detail ? ` (${detail})` : ""}`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
    this.intuitTid = intuitTid;
  }
}

/**
 * Provider returned 429 (`ThrottleExceeded`, 500 req/min per realm per
 * app). Carries the parsed `Retry-After` seconds when the header was
 * present — Intuit does not document the header, so it is parsed
 * defensively. The message deliberately omits the response body.
 */
export class RateLimitedError extends Error {
  readonly retryAfterSeconds: number | null;
  /** Intuit `intuit_tid` correlation id for the failing response, if present. */
  readonly intuitTid: string | null;
  constructor(retryAfterSeconds: number | null, intuitTid: string | null = null) {
    super(
      `QuickBooks rate limit hit (HTTP 429)${
        retryAfterSeconds !== null ? `; retry after ${retryAfterSeconds}s` : ""
      }.`,
    );
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.intuitTid = intuitTid;
  }
}

/**
 * Generic non-OK Accounting-API failure that isn't 401/403/404/429. Carries the
 * sanitized Fault message (`surfaceQuickbooksError` — Message+code, never
 * `Detail`), the HTTP `status`, and the `intuitTid`. The `intuit_tid` lives on
 * the metadata field ONLY — it is deliberately kept out of `message` so it can
 * never surface into a user-facing workflow-error string.
 */
export class QuickbooksApiError extends Error {
  readonly status: number;
  /** Intuit `intuit_tid` correlation id for the failing response, if present. */
  readonly intuitTid: string | null;
  constructor(status: number, sanitizedMessage: string, intuitTid: string | null = null) {
    super(sanitizedMessage);
    this.name = "QuickbooksApiError";
    this.status = status;
    this.intuitTid = intuitTid;
  }
}

/**
 * Extract the first human-readable message from QuickBooks' Fault
 * envelope (`{ Fault: { Error: [{ Message, Detail, code }], type } }`)
 * without ever surfacing the raw body. Returns `Message (code <n>)` —
 * `Detail` frequently embeds entity field values (customer names, doc
 * numbers), so it is deliberately NOT surfaced. Falls back to
 * `HTTP <status>`.
 */
export function surfaceQuickbooksError(bodyText: string, status: number): string {
  try {
    const parsed = JSON.parse(bodyText) as {
      Fault?: {
        Error?: Array<{ Message?: string; code?: string }>;
      };
    };
    const first = parsed.Fault?.Error?.[0];
    if (first && typeof first.Message === "string" && first.Message.length > 0) {
      return typeof first.code === "string" && first.code.length > 0
        ? `${first.Message} (code ${first.code})`
        : first.Message;
    }
  } catch {
    // not JSON
  }
  return `HTTP ${status}`;
}
