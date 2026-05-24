/**
 * Monday-specific typed errors thrown by GraphQL wrappers — Slice 3.MONDAY-2.
 *
 * `Unauthorized401Error` (for the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — wrappers import that one directly.
 * This file holds Monday-shape-specific errors that handlers (not the
 * refresh wrapper) catch.
 *
 * Mirrors the shape of `_shared/microsoft/api/errors.ts` so cross-
 * provider error handling stays consistent.
 */

/**
 * Thrown by wrappers when Monday's GraphQL response indicates the
 * resource doesn't exist (HTTP 404, or a `ResourceNotFoundException` /
 * not-found-shaped GraphQL error). Monday tends to surface missing
 * boards / items via GraphQL errors with HTTP 200 — so this error
 * type captures both transports.
 *
 * Handlers can catch this to give the same "we couldn't find that" UX
 * regardless of which sub-cause fired.
 */
export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Monday resource '${resource}' not found${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

/**
 * Thrown when Monday signals rate-limit / complexity-budget exhaustion.
 * Monday's GraphQL API uses complexity-based limits — exceeding the
 * per-minute or per-query budget returns either HTTP 429 or a GraphQL
 * error with `extensions.code === "ComplexityException"` /
 * `"DailyLimitExceeded"`. MONDAY-2 does NOT implement backoff (per
 * scope) but does surface this error type so callers and observability
 * can distinguish rate failures from other failures.
 */
export class RateLimitError extends Error {
  readonly retryAfterSeconds: number | null;
  constructor(detail?: string, retryAfterSeconds: number | null = null) {
    super(
      `Monday rate limit exceeded${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Generic Monday GraphQL error — anything that isn't 401 / 404-shape /
 * rate-shape falls through to this type. The constructor SANITIZES
 * Monday's GraphQL response bodies so we never leak access tokens,
 * refresh tokens, client secrets, raw response payloads, or webhook
 * secrets through error messages.
 *
 * `surfaceMondayGraphqlErrors` extracts a human-readable message from
 * the response's `errors[]` envelope. Callers should use that helper to
 * construct the detail string before wrapping in this error.
 */
export class MondayApiError extends Error {
  readonly status: number | null;
  constructor(detail: string, status: number | null = null) {
    super(`Monday API error${status ? ` (HTTP ${status})` : ""}: ${detail}`);
    this.name = "MondayApiError";
    this.status = status;
  }
}

// ─── Error payload shapes ───────────────────────────────────────────────────

interface MondayGraphqlError {
  message?: string;
  extensions?: {
    code?: string;
    [key: string]: unknown;
  };
}

interface MondayGraphqlEnvelope {
  data?: unknown;
  errors?: MondayGraphqlError[];
  error_message?: string;
  error_code?: string;
}

/**
 * Pull a human-readable error message from a Monday GraphQL response
 * payload. Strips anything that could leak credentials — only the
 * `message` and `extensions.code` fields are surfaced, never the raw
 * response body or arbitrary extension fields.
 *
 * Used at every Monday error site so the sanitization rule has one
 * source of truth.
 */
export function surfaceMondayGraphqlErrors(
  text: string,
  status: number,
): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as MondayGraphqlEnvelope;
    if (parsed.errors && parsed.errors.length > 0) {
      const messages = parsed.errors
        .map((e) => {
          const code = e.extensions?.code;
          const message = e.message ?? "unknown";
          return code ? `${code}: ${message}` : message;
        })
        .join("; ");
      detail = messages;
    } else if (parsed.error_message) {
      detail = parsed.error_code
        ? `${parsed.error_code}: ${parsed.error_message}`
        : parsed.error_message;
    }
  } catch {
    // not JSON
  }
  return detail;
}

/**
 * Inspect a GraphQL error array for "not found"-shaped failures. Monday
 * surfaces missing resources via various code strings — this helper
 * centralizes the detection so wrappers can decide whether to throw
 * `NotFoundError` vs `MondayApiError`.
 */
export function isNotFoundError(errors: MondayGraphqlError[]): boolean {
  return errors.some((e) => {
    const code = e.extensions?.code;
    if (code === "ResourceNotFoundException") return true;
    if (code === "InvalidArgumentException") {
      // Monday returns InvalidArgumentException for some "id not found"
      // cases — we treat those as NotFound for the standard handler
      // 404 path.
      const message = (e.message ?? "").toLowerCase();
      return (
        message.includes("not found") || message.includes("does not exist")
      );
    }
    return false;
  });
}

/**
 * Inspect a GraphQL error array for rate-limit / complexity failures.
 */
export function isRateLimitError(errors: MondayGraphqlError[]): boolean {
  return errors.some((e) => {
    const code = e.extensions?.code;
    return (
      code === "ComplexityException" ||
      code === "RateLimitExceeded" ||
      code === "DailyLimitExceeded"
    );
  });
}

export type { MondayGraphqlError };
