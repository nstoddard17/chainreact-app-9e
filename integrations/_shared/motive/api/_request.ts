import {
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  MotiveApiError,
  NotFoundError,
  RateLimitedError,
  logMotiveApiError,
  readMotiveRequestId,
  surfaceMotiveError,
} from "../errors";

/**
 * Shared HTTP request helper for the Motive (gomotive.com) API — MOTIVE-1.
 *
 * Mirrors `_shared/quickbooks/api/_request.ts`: thin per-resource wrappers
 * (fuelPurchases.ts, vehicles.ts, …) construct path + query + body and delegate
 * here for HTTP semantics + auth + error mapping.
 *
 * Wire format (docs/providers/motive/research.md):
 *   - Base: `https://api.gomotive.com` (`MOTIVE_API_BASE` override for e2e).
 *   - `Authorization: Bearer <token>` — decrypted access token threaded by
 *     `refreshAndRetry`'s `apiCall` callback. The wrapper NEVER refreshes.
 *   - JSON in/out. Optional query params.
 *
 * Error mapping:
 *   - 401 → `Unauthorized401Error` (caught by `refreshAndRetry` → one refresh +
 *     retry; access tokens expire after 2 hours).
 *   - 403 → `InsufficientScopeError` (a refresh keeps the same granted scopes;
 *     needs re-consent). Body NOT surfaced.
 *   - 404 → `NotFoundError`.
 *   - 429 → `RateLimitedError(retryAfterSeconds)` — limits are undocumented;
 *     `Retry-After` parsed defensively.
 *   - Other non-OK → `MotiveApiError` with the sanitized top-level message.
 *
 * `X-Request-Id` capture: read from EVERY response and, on failure, written to a
 * sanitized `motive.api.error` log + carried on the error classes' `requestId`.
 * It is opaque and non-sensitive — never logged with the token/Authorization
 * header or raw body, and never surfaced into workflow outputs or UI.
 */

export function motiveApiBase(): string {
  return process.env.MOTIVE_API_BASE ?? "https://api.gomotive.com";
}

export interface MotiveRequestInput {
  /** Decrypted access token from the integration row. */
  accessToken: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Path relative to the API base — MUST start with a leading slash (e.g. `/v1/fuel_purchases`). */
  path: string;
  /** Optional query parameters. */
  query?: URLSearchParams;
  /** Optional JSON request payload. */
  data?: Readonly<Record<string, unknown>>;
  /** Resource label for `NotFoundError` (e.g. `"fuel purchase 42"`). */
  resourceForNotFound: string;
}

function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function throwMapped(
  res: Response,
  input: MotiveRequestInput,
  requestId: string | null,
): Promise<never> {
  logMotiveApiError({
    method: input.method,
    path: input.path,
    status: res.status,
    requestId,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Motive ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 403) {
    throw new InsufficientScopeError(
      `Motive ${input.method} ${input.path} returned HTTP 403 (insufficient scope)`,
      "motive",
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceMotiveError(text, 404),
      requestId,
    );
  }
  if (res.status === 429) {
    throw new RateLimitedError(parseRetryAfter(res), requestId);
  }
  const text = await res.text().catch(() => "");
  throw new MotiveApiError(
    res.status,
    `Motive ${input.method} ${input.path} failed: ${surfaceMotiveError(text, res.status)}`,
    requestId,
  );
}

/** Fire one Motive API request and return the parsed JSON body (or `{}` for empty). */
export async function motiveRequest<T>(input: MotiveRequestInput): Promise<T> {
  const qs = input.query ? `?${new URLSearchParams(input.query).toString()}` : "";
  const url = `${motiveApiBase()}${input.path}${qs}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    Accept: "application/json",
  };

  let bodyString: string | undefined;
  if (input.data !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyString = JSON.stringify(input.data);
  }

  const res = await fetch(url, {
    method: input.method,
    headers,
    body: bodyString,
  });

  const requestId = readMotiveRequestId(res);

  if (!res.ok) await throwMapped(res, input, requestId);

  return (await res.json().catch(() => ({}))) as T;
}
