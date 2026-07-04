/**
 * Typed Typeform API errors — Slice 5.TYPEFORM-1.
 *
 * Mirrors `_shared/asana/errors.ts` / `_shared/monday/errors.ts`: the
 * shared `_request` helper maps HTTP statuses to these classes so option
 * resolvers and trigger lifecycle hooks can branch on `instanceof`
 * without parsing message strings. 401/403 are NOT here — they map to
 * the cross-provider `Unauthorized401Error` / `InsufficientScopeError`
 * from `services/oauth/refreshAndRetry`.
 */

/** Provider returned 404 for the named resource. */
export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Typeform resource not found: ${resource}${detail ? ` (${detail})` : ""}`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

/**
 * Provider returned 429 (2 req/s per account per the docs). Carries the
 * parsed `Retry-After` seconds when the header was present — Typeform
 * does not document rate-limit headers, so this is parsed defensively.
 * The message deliberately omits the response body (no-raw-body rule).
 */
export class RateLimitedError extends Error {
  readonly retryAfterSeconds: number | null;
  constructor(retryAfterSeconds: number | null) {
    super(
      `Typeform rate limit hit (HTTP 429)${
        retryAfterSeconds !== null ? `; retry after ${retryAfterSeconds}s` : ""
      }.`,
    );
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Extract the first human-readable message from Typeform's error envelope
 * (`{ "code": "…", "description": "…" }`, sometimes with a `details`
 * array) without ever surfacing the raw body. Falls back to
 * `HTTP <status>`.
 */
export function surfaceTypeformError(bodyText: string, status: number): string {
  try {
    const parsed = JSON.parse(bodyText) as {
      description?: string;
      code?: string;
    };
    if (typeof parsed.description === "string" && parsed.description.length > 0) {
      return parsed.description;
    }
    if (typeof parsed.code === "string" && parsed.code.length > 0) {
      return parsed.code;
    }
  } catch {
    // not JSON
  }
  return `HTTP ${status}`;
}
