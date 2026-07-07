import {
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError, RateLimitedError, surfaceAsanaError } from "../errors";

/**
 * Shared HTTP request helper for the Asana REST API — Slice 5.ASANA-1.
 *
 * Mirrors `_shared/hubspot/api/_request.ts` shape: thin per-resource
 * wrappers (tasksCreate.ts, projectsList.ts, …) construct path + body and
 * delegate here for HTTP semantics + auth + error mapping.
 *
 * Wire-format (https://developers.asana.com/docs — research.md):
 *   - Base: `https://app.asana.com/api/1.0` (ASANA_API_BASE override for
 *     e2e mocks; production never sets it).
 *   - `Authorization: Bearer <token>` — decrypted access token threaded by
 *     `refreshAndRetry`'s `apiCall` callback.
 *   - JSON in/out. Request bodies are wrapped in Asana's `{ "data": … }`
 *     envelope BY THIS HELPER — wrappers pass the inner object only.
 *   - Success responses unwrap the `{ "data": … }` envelope; wrappers
 *     receive the inner value directly.
 *
 * Error mapping:
 *   - 401 → `Unauthorized401Error` (caught by `refreshAndRetry` → one
 *     refresh + retry; Asana access tokens expire hourly so this is the
 *     NORMAL steady-state path, not an anomaly).
 *   - 403 → `InsufficientScopeError` (a refresh keeps the same granted
 *     scopes; needs re-consent, not retry — option resolvers map it to
 *     PROVIDER_REAUTH_REQUIRED). Body NOT surfaced (can echo scope lists).
 *   - 404 → `NotFoundError(resourceForNotFound)`.
 *   - 429 → `RateLimitedError(retryAfterSeconds)` — Asana sends a standard
 *     `Retry-After` header; rejected requests still count against quota.
 *   - Other non-OK → generic Error with the envelope's first
 *     `errors[0].message` via `surfaceAsanaError` (never the raw body).
 */

function asanaApiBase(): string {
  return process.env.ASANA_API_BASE ?? "https://app.asana.com/api/1.0";
}

export interface AsanaRequestInput {
  /** Decrypted access token from the integration row. */
  accessToken: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Path relative to the API base. MUST start with a leading slash. */
  path: string;
  /** Optional query parameters appended to the URL. */
  query?: URLSearchParams;
  /**
   * Optional request payload. Passed as the INNER object — this helper
   * wraps it in Asana's `{ "data": … }` envelope. Pass `undefined` for
   * GET / DELETE.
   */
  data?: Readonly<Record<string, unknown>>;
  /** Resource label for `NotFoundError` (e.g. `"task 1234"`). */
  resourceForNotFound: string;
}

function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Fire one Asana API request and return the UNWRAPPED `data` value.
 */
export async function asanaRequest<T>(input: AsanaRequestInput): Promise<T> {
  const queryString = input.query ? input.query.toString() : "";
  const url = `${asanaApiBase()}${input.path}${queryString ? `?${queryString}` : ""}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    Accept: "application/json",
  };

  let bodyString: string | undefined;
  if (input.data !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyString = JSON.stringify({ data: input.data });
  }

  const res = await fetch(url, {
    method: input.method,
    headers,
    body: bodyString,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Asana ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 403) {
    throw new InsufficientScopeError(
      `Asana ${input.method} ${input.path} returned HTTP 403 (insufficient scope)`,
      "asana",
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceAsanaError(text, 404),
    );
  }
  if (res.status === 429) {
    throw new RateLimitedError(parseRetryAfter(res));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Asana ${input.method} ${input.path} failed: ${surfaceAsanaError(text, res.status)}`,
    );
  }

  // Asana returns `{ "data": … }` on every 2xx with content; DELETE
  // returns `{ "data": {} }`. Defensive: treat a missing envelope as the
  // raw JSON (should not happen per docs).
  const json = (await res.json().catch(() => ({}))) as { data?: T };
  return (json.data !== undefined ? json.data : (json as unknown)) as T;
}

/**
 * Shared shape of Asana's pagination envelope. Wrappers that list
 * collections request it explicitly via `asanaListRequest`.
 */
export interface AsanaPage<T> {
  items: T[];
  /** True when Asana returned a `next_page` cursor (more results exist). */
  hasMore: boolean;
  /**
   * Asana's opaque `next_page.offset` cursor for the following page, or
   * null on the last page. Callers that expose pagination (ASANA-2
   * `list_tasks_in_project`) thread it back in as the `offset` query
   * param; pickers ignore it.
   */
  nextOffset: string | null;
}

/**
 * List-endpoint variant: keeps the `next_page` signal alongside the
 * unwrapped `data` array. One page per call; V2 pickers cap at `limit`
 * and let the search box refine (see options resolvers).
 */
export async function asanaListRequest<T>(
  input: AsanaRequestInput,
): Promise<AsanaPage<T>> {
  const queryString = input.query ? input.query.toString() : "";
  const url = `${asanaApiBase()}${input.path}${queryString ? `?${queryString}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
    },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Asana GET ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 403) {
    throw new InsufficientScopeError(
      `Asana GET ${input.path} returned HTTP 403 (insufficient scope)`,
      "asana",
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceAsanaError(text, 404),
    );
  }
  if (res.status === 429) {
    throw new RateLimitedError(parseRetryAfter(res));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Asana GET ${input.path} failed: ${surfaceAsanaError(text, res.status)}`,
    );
  }

  const json = (await res.json().catch(() => ({}))) as {
    data?: T[];
    next_page?: { offset?: string } | null;
  };
  const nextOffset =
    json.next_page != null && typeof json.next_page.offset === "string"
      ? json.next_page.offset
      : null;
  return {
    items: Array.isArray(json.data) ? json.data : [],
    hasMore: json.next_page != null,
    nextOffset,
  };
}
