/**
 * Google Analytics (GA4) API errors — Slice 3.GOOGLE-ANALYTICS-2.
 *
 * `Unauthorized401Error` (for the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — wrappers import that one directly
 * and throw it on HTTP 401. This file holds GA-shape errors handlers catch.
 *
 * Mirrors `integrations/_shared/google/api/docs/errors.ts`, plus a typed
 * quota error (D-GA5: surface a typed error + structured log; NO automatic
 * backoff).
 *
 * **Sanitization rule (load-bearing):** GA error envelopes carry a free-text
 * `error.message`. `surfaceAnalyticsErrorDetail` extracts ONLY Google's
 * machine-readable `error.status` (e.g. `INVALID_ARGUMENT`,
 * `RESOURCE_EXHAUSTED`) or the HTTP status — NEVER the free-text message,
 * the raw body, the request body (report metrics/dimensions), report row
 * values, the access token, or (critically) the Measurement Protocol URL
 * which embeds the `api_secret`.
 */

export class AnalyticsNotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string) {
    super(`Google Analytics resource '${resource}' not found.`);
    this.name = "AnalyticsNotFoundError";
    this.resource = resource;
  }
}

/**
 * Thrown on GA4 quota / rate exhaustion (HTTP 429 or
 * `error.status === "RESOURCE_EXHAUSTED"`). Carries only a sanitized tag;
 * backoff is deferred (D-GA5).
 */
export class AnalyticsQuotaError extends Error {
  readonly tag: string;
  constructor(tag: string) {
    super(`Google Analytics quota exceeded (${tag}).`);
    this.name = "AnalyticsQuotaError";
    this.tag = tag;
  }
}

/**
 * Generic GA4 API error — anything not 401 / not-found / quota. Carries the
 * already-sanitized tag (`error.status` or `HTTP <status>`).
 */
export class AnalyticsApiError extends Error {
  readonly status: number;
  readonly tag: string;
  constructor(tag: string, status: number) {
    super(`Google Analytics API error (HTTP ${status}): ${tag}`);
    this.name = "AnalyticsApiError";
    this.status = status;
    this.tag = tag;
  }
}

interface AnalyticsErrorPayload {
  error?: { code?: number; message?: string; status?: string };
}

/**
 * Pull Google's machine-readable `error.status` out of a response body into
 * a sanitized tag. NEVER returns the free-text `error.message` or the raw
 * body. Falls back to `HTTP <status>`.
 */
export function surfaceAnalyticsErrorDetail(
  text: string,
  status: number,
): string {
  try {
    const parsed = JSON.parse(text) as AnalyticsErrorPayload;
    if (parsed?.error?.status) return parsed.error.status;
  } catch {
    // not JSON
  }
  return `HTTP ${status}`;
}

/** True when the GA error body / status indicates quota exhaustion. */
export function isQuotaStatus(text: string, status: number): boolean {
  if (status === 429) return true;
  try {
    const parsed = JSON.parse(text) as AnalyticsErrorPayload;
    return parsed?.error?.status === "RESOURCE_EXHAUSTED";
  } catch {
    return false;
  }
}
