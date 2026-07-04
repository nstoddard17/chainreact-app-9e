/**
 * Typed Asana API errors — Slice 5.ASANA-1.
 *
 * Mirrors `_shared/monday/errors.ts` / `_shared/hubspot/errors.ts`: the
 * shared `_request` helper maps HTTP statuses to these classes so action
 * handlers, option resolvers, and trigger lifecycle hooks can branch on
 * `instanceof` without parsing message strings. 401/403 are NOT here —
 * they map to the cross-provider `Unauthorized401Error` /
 * `InsufficientScopeError` from `services/oauth/refreshAndRetry`.
 */

/** Provider returned 404 for the named resource. */
export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Asana resource not found: ${resource}${detail ? ` (${detail})` : ""}`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

/**
 * Provider returned 429. Carries the parsed `Retry-After` seconds when the
 * header was present so future engine-level backoff can consume it. The
 * message deliberately omits the response body (Asana error bodies are
 * short, but the no-raw-body rule is uniform).
 */
export class RateLimitedError extends Error {
  readonly retryAfterSeconds: number | null;
  constructor(retryAfterSeconds: number | null) {
    super(
      `Asana rate limit hit (HTTP 429)${
        retryAfterSeconds !== null ? `; retry after ${retryAfterSeconds}s` : ""
      }.`,
    );
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Extract the first human-readable message from Asana's error envelope
 * (`{ "errors": [{ "message": "…", "help": "…" }] }`) without ever
 * surfacing the raw body. Falls back to `HTTP <status>`.
 */
export function surfaceAsanaError(bodyText: string, status: number): string {
  try {
    const parsed = JSON.parse(bodyText) as {
      errors?: Array<{ message?: string }>;
    };
    const message = parsed.errors?.[0]?.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    // not JSON
  }
  return `HTTP ${status}`;
}
