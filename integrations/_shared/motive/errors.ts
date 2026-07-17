/**
 * Typed Motive (gomotive.com) API errors — MOTIVE-1.
 *
 * Mirrors `_shared/quickbooks/errors.ts`: the shared `_request` helper maps
 * HTTP statuses to these classes so action handlers, option resolvers, and the
 * webhook layer can branch on `instanceof` without parsing message strings.
 * 401/403 are NOT here — they map to the cross-provider `Unauthorized401Error`
 * / `InsufficientScopeError` from `services/oauth/refreshAndRetry`.
 *
 * Motive stamps responses with an `X-Request-Id` correlation header (opaque,
 * non-sensitive). It is recorded on error metadata + a sanitized troubleshooting
 * log ONLY — never surfaced into user-facing messages, and NEVER paired with the
 * Authorization header, tokens, the webhook signing secret, or the raw body.
 */

/** Motive's response-header name for the request/correlation id. */
export const MOTIVE_REQUEST_ID_HEADER = "x-request-id";

/** Read Motive's `X-Request-Id` correlation id from a response. Null when absent. */
export function readMotiveRequestId(res: { headers: Headers }): string | null {
  const id = res.headers.get(MOTIVE_REQUEST_ID_HEADER);
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Sanitized troubleshooting log for a failed Motive API call. Emits ONLY the
 * correlation id + coarse coordinates (method, path, status) — never the
 * Authorization header, access token, webhook secret, or the raw provider body.
 */
export function logMotiveApiError(input: {
  method: string;
  path: string;
  status: number;
  requestId: string | null;
}): void {
  console.error(
    JSON.stringify({
      event: "motive.api.error",
      method: input.method,
      path: input.path,
      status: input.status,
      requestId: input.requestId,
    }),
  );
}

/** Provider returned 404 for the named resource. */
export class NotFoundError extends Error {
  readonly resource: string;
  readonly requestId: string | null;
  constructor(resource: string, detail?: string, requestId: string | null = null) {
    super(`Motive resource not found: ${resource}${detail ? ` (${detail})` : ""}`);
    this.name = "NotFoundError";
    this.resource = resource;
    this.requestId = requestId;
  }
}

/**
 * Provider returned 429. Carries the parsed `Retry-After` seconds when the
 * header was present. Motive publishes no rate-limit numbers, so the header is
 * parsed defensively. The message deliberately omits the response body.
 */
export class RateLimitedError extends Error {
  readonly retryAfterSeconds: number | null;
  readonly requestId: string | null;
  constructor(retryAfterSeconds: number | null, requestId: string | null = null) {
    super(
      `Motive rate limit hit (HTTP 429)${
        retryAfterSeconds !== null ? `; retry after ${retryAfterSeconds}s` : ""
      }.`,
    );
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.requestId = requestId;
  }
}

/**
 * Generic non-OK Motive failure that isn't 401/403/404/429. Carries the
 * sanitized top-level message (`surfaceMotiveError`), the HTTP `status`, and the
 * `requestId` (metadata field only — kept out of `message` so it can never
 * surface into a user-facing workflow-error string).
 */
export class MotiveApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  constructor(status: number, sanitizedMessage: string, requestId: string | null = null) {
    super(sanitizedMessage);
    this.name = "MotiveApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

/**
 * Extract a single human-readable message from Motive's error body without
 * surfacing the raw payload. Motive error shapes seen in the docs:
 * `{ "error": "message" }`, `{ "error": { "message": "..." } }`, or
 * `{ "messages": ["..."] }`. Nested field-level detail is deliberately dropped
 * (it can echo submitted values). Falls back to `HTTP <status>`.
 */
export function surfaceMotiveError(bodyText: string, status: number): string {
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: string | { message?: string };
      message?: string;
      messages?: unknown;
    };
    if (typeof parsed.error === "string" && parsed.error.length > 0) {
      return parsed.error;
    }
    if (
      parsed.error &&
      typeof parsed.error === "object" &&
      typeof parsed.error.message === "string" &&
      parsed.error.message.length > 0
    ) {
      return parsed.error.message;
    }
    if (typeof parsed.message === "string" && parsed.message.length > 0) {
      return parsed.message;
    }
    if (Array.isArray(parsed.messages)) {
      const first = parsed.messages.find(
        (m): m is string => typeof m === "string" && m.length > 0,
      );
      if (first) return first;
    }
  } catch {
    // not JSON
  }
  return `HTTP ${status}`;
}
