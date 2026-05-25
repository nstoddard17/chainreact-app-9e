import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  isNotFoundError,
  isRateLimitError,
  MondayApiError,
  NotFoundError,
  RateLimitError,
  surfaceMondayGraphqlErrors,
  type MondayGraphqlError,
} from "../errors";

/**
 * Shared Monday GraphQL request layer — Slice 3.MONDAY-2.
 *
 * Every Monday API wrapper (boardsList / itemsCreate / itemsGet / …)
 * routes through `mondayRequest` so the OAuth + transport + error
 * surface stays in exactly one place. Mirrors the per-call wrapper
 * pattern Microsoft uses for Graph (no provider-specific code in the
 * shared helper — handlers control the GraphQL document).
 *
 * Endpoint:
 *   - Default: `https://api.monday.com/v2`
 *   - Override: `MONDAY_API_BASE` env var (e2e walkthrough convention).
 *     The override applies to the `/v2` path too — caller doesn't add
 *     `/v2` themselves.
 *
 * Headers:
 *   - `Authorization: Bearer <accessToken>` — every action handler
 *     call site uses this shape in V1. Monday accepts both `Bearer …`
 *     and raw `…` forms; we standardize on Bearer for consistency.
 *   - `Content-Type: application/json`.
 *   - `API-Version` — defaults to "2024-01" (manifest pin). Callers can
 *     override per-call when MONDAY-5's webhook lifecycle moves to
 *     `2025-04`.
 *
 * Error model:
 *   - HTTP 401 → throw `Unauthorized401Error` so `refreshAndRetry`
 *     fires exactly one refresh + retry.
 *   - HTTP 429 → throw `RateLimitError` with the `Retry-After` header
 *     parsed when present.
 *   - HTTP 200 with `errors[]` non-empty:
 *       - rate-limit-shaped (Complexity / DailyLimit) → `RateLimitError`.
 *       - not-found-shaped (ResourceNotFoundException / Invalid w/ "not
 *         found") → `NotFoundError`.
 *       - other → `MondayApiError`.
 *   - HTTP 4xx/5xx other → `MondayApiError` with HTTP status.
 *
 * Rate-limit observability:
 *   - When `X-RateLimit-Remaining` or `X-Daily-Limit-Remaining` falls
 *     below 10% of its limit, emit a structured warning log. No backoff
 *     (per slice scope). MONDAY-N may add complexity-aware backoff once
 *     real consumers exercise the rate limit.
 *
 * Security:
 *   - Never includes the access token, the request body, or the raw
 *     response body in thrown error messages. `surfaceMondayGraphqlErrors`
 *     extracts only `message` + `extensions.code` from the GraphQL
 *     envelope — anything else is dropped.
 *   - Refresh tokens / client secrets / webhook secrets never transit
 *     this layer (they only live in `oauth.ts` / the manifest).
 */

interface MondayGraphqlEnvelope<T> {
  data?: T;
  errors?: MondayGraphqlError[];
  error_message?: string;
  error_code?: string;
  account_id?: number;
}

export interface MondayRequestInput<TVariables = Record<string, unknown>> {
  accessToken: string;
  query: string;
  variables?: TVariables;
  /**
   * Override the `API-Version` header. Defaults to manifest's
   * `2024-01`. MONDAY-5 may set `2025-04` for `create_webhook`.
   */
  apiVersion?: string;
}

const DEFAULT_API_VERSION = "2024-01";

export function mondayApiBase(): string {
  return process.env.MONDAY_API_BASE ?? "https://api.monday.com";
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function logRateBudgetIfLow(response: Response): void {
  // Monday's documented rate headers — when remaining drops below 10%
  // of the limit, emit a warning. Defensive parsing — missing headers
  // are silently ignored.
  const pairs: Array<{ remainingHeader: string; limitHeader: string }> = [
    {
      remainingHeader: "x-ratelimit-remaining",
      limitHeader: "x-ratelimit-limit",
    },
    {
      remainingHeader: "x-daily-limit-remaining",
      limitHeader: "x-daily-limit",
    },
  ];
  for (const { remainingHeader, limitHeader } of pairs) {
    const remainingRaw = response.headers.get(remainingHeader);
    const limitRaw = response.headers.get(limitHeader);
    if (remainingRaw === null || limitRaw === null) continue;
    const remaining = Number.parseInt(remainingRaw, 10);
    const limit = Number.parseInt(limitRaw, 10);
    if (
      !Number.isFinite(remaining) ||
      !Number.isFinite(limit) ||
      limit <= 0
    ) {
      continue;
    }
    if (remaining < limit * 0.1) {
      console.warn("[monday] rate budget low", {
        header: remainingHeader,
        remaining,
        limit,
      });
    }
  }
}

/**
 * Execute a Monday GraphQL request. Returns the `data` field of the
 * envelope; throws on every documented failure shape.
 *
 * Generic parameter `T` is the shape of the `data` field — callers
 * declare the GraphQL document and the matching TypeScript shape so
 * wrappers stay type-safe without `as any`.
 */
export async function mondayRequest<T, V = Record<string, unknown>>(
  input: MondayRequestInput<V>,
): Promise<T> {
  const url = `${mondayApiBase()}/v2`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      "API-Version": input.apiVersion ?? DEFAULT_API_VERSION,
    },
    body: JSON.stringify({
      query: input.query,
      variables: input.variables ?? {},
    }),
  });

  if (response.status === 401) {
    throw new Unauthorized401Error(
      "Monday GraphQL request returned HTTP 401",
    );
  }
  if (response.status === 429) {
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    throw new RateLimitError("HTTP 429", retryAfter);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new MondayApiError(
      surfaceMondayGraphqlErrors(text, response.status),
      response.status,
    );
  }

  logRateBudgetIfLow(response);

  const envelope = (await response.json()) as MondayGraphqlEnvelope<T>;

  if (envelope.errors && envelope.errors.length > 0) {
    if (isRateLimitError(envelope.errors)) {
      const detail = envelope.errors
        .map((e) => e.message ?? "complexity exceeded")
        .join("; ");
      throw new RateLimitError(detail, null);
    }
    if (isNotFoundError(envelope.errors)) {
      const detail = envelope.errors
        .map((e) => e.message ?? "not found")
        .join("; ");
      // Resource label is intentionally generic at the shared layer —
      // callers can catch + rethrow with their own resource string.
      throw new NotFoundError("monday resource", detail);
    }
    const detail = envelope.errors
      .map((e) => {
        const code = e.extensions?.code;
        const message = e.message ?? "unknown";
        return code ? `${code}: ${message}` : message;
      })
      .join("; ");
    throw new MondayApiError(detail, response.status);
  }

  if (envelope.error_message || envelope.error_code) {
    // Legacy error envelope shape (non-GraphQL errors Monday sometimes
    // emits) — surface as MondayApiError. Sanitized by construction.
    const detail = envelope.error_code
      ? `${envelope.error_code}: ${envelope.error_message ?? ""}`
      : (envelope.error_message ?? "unknown");
    throw new MondayApiError(detail, response.status);
  }

  if (envelope.data === undefined) {
    throw new MondayApiError(
      "Monday GraphQL response missing `data` field",
      response.status,
    );
  }
  return envelope.data;
}
