/**
 * Typed Calendly API errors — Slice 5.CALENDLY-1.
 *
 * Mirrors `_shared/typeform/errors.ts` / `_shared/asana/errors.ts`: the
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
      `Calendly resource not found: ${resource}${detail ? ` (${detail})` : ""}`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

/**
 * Provider returned 409 — for webhook subscriptions this means a
 * duplicate (url, events, scope) subscription already exists. V2's
 * per-node notification URL makes that reachable only when a crashed
 * lifecycle left an orphan subscription; activation surfaces a
 * humanized deactivate/reactivate hint.
 */
export class ConflictError extends Error {
  constructor(detail?: string) {
    super(`Calendly returned a conflict (HTTP 409)${detail ? `: ${detail}` : ""}.`);
    this.name = "ConflictError";
  }
}

/**
 * Provider returned 429. Carries the parsed `Retry-After` seconds when
 * the header was present — Calendly's official rate-limit numbers are
 * not machine-verifiable (research.md), so this is parsed defensively.
 * The message deliberately omits the response body (no-raw-body rule).
 */
export class RateLimitedError extends Error {
  readonly retryAfterSeconds: number | null;
  constructor(retryAfterSeconds: number | null) {
    super(
      `Calendly rate limit hit (HTTP 429)${
        retryAfterSeconds !== null ? `; retry after ${retryAfterSeconds}s` : ""
      }.`,
    );
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Extract the first human-readable message from Calendly's error
 * envelope (`{ "title": "…", "message": "…", "details": [...] }`)
 * without ever surfacing the raw body. Falls back to `HTTP <status>`.
 */
export function surfaceCalendlyError(bodyText: string, status: number): string {
  try {
    const parsed = JSON.parse(bodyText) as {
      message?: string;
      title?: string;
    };
    if (typeof parsed.message === "string" && parsed.message.length > 0) {
      return parsed.message;
    }
    if (typeof parsed.title === "string" && parsed.title.length > 0) {
      return parsed.title;
    }
  } catch {
    // not JSON
  }
  return `HTTP ${status}`;
}
