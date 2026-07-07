/**
 * Typed QuickBooks Online API errors — QUICKBOOKS-1.
 *
 * Mirrors `_shared/typeform/errors.ts` / `_shared/asana/errors.ts`: the
 * shared `_request` helper maps HTTP statuses to these classes so action
 * handlers, option resolvers, and the webhook enrichment layer can branch
 * on `instanceof` without parsing message strings. 401/403 are NOT here —
 * they map to the cross-provider `Unauthorized401Error` /
 * `InsufficientScopeError` from `services/oauth/refreshAndRetry`.
 */

/** Provider returned 404 for the named resource. */
export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `QuickBooks resource not found: ${resource}${detail ? ` (${detail})` : ""}`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
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
  constructor(retryAfterSeconds: number | null) {
    super(
      `QuickBooks rate limit hit (HTTP 429)${
        retryAfterSeconds !== null ? `; retry after ${retryAfterSeconds}s` : ""
      }.`,
    );
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
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
