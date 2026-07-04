import {
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
  surfaceCalendlyError,
} from "../errors";

/**
 * Shared HTTP request helper for the Calendly REST API — Slice
 * 5.CALENDLY-1.
 *
 * Mirrors `_shared/typeform/api/_request.ts` shape: thin per-resource
 * wrappers (users.ts, eventTypes.ts, webhookSubscriptions.ts) construct
 * path + body and delegate here for HTTP semantics + auth + error
 * mapping.
 *
 * Wire-format (docs/providers/calendly/research.md):
 *   - Base: `https://api.calendly.com` (CALENDLY_API_BASE override for
 *     e2e mocks; production never sets it). API v1 was discontinued
 *     May 2025 — everything here is v2.
 *   - `Authorization: Bearer <token>` — decrypted access token threaded
 *     by `refreshAndRetry`'s `apiCall` callback.
 *   - JSON in/out. Single resources arrive under `{ resource: … }`,
 *     collections under `{ collection: […], pagination: … }` — the
 *     per-resource wrappers unwrap; this helper stays envelope-agnostic.
 *
 * Error mapping:
 *   - 401 → `Unauthorized401Error` (caught by `refreshAndRetry` → one
 *     refresh + retry; Calendly access tokens expire after 2 hours).
 *   - 403 → `InsufficientScopeError` (a refresh keeps the same granted
 *     scopes; needs re-consent — OR, for webhook subscriptions, the
 *     paid-plan gate; activate.ts humanizes that case). Body NOT
 *     surfaced.
 *   - 404 → `NotFoundError(resourceForNotFound)`.
 *   - 409 → `ConflictError` (duplicate webhook subscription).
 *   - 429 → `RateLimitedError(retryAfterSeconds)` — official limits are
 *     not machine-verifiable; Retry-After parsed defensively.
 *   - Other non-OK → generic Error with the envelope's `message`/`title`
 *     via `surfaceCalendlyError` (never the raw body).
 */

function calendlyApiBase(): string {
  return process.env.CALENDLY_API_BASE ?? "https://api.calendly.com";
}

export interface CalendlyRequestInput {
  /** Decrypted access token from the integration row. */
  accessToken: string;
  method: "GET" | "POST" | "DELETE";
  /** Path relative to the API base. MUST start with a leading slash. */
  path: string;
  /** Optional query parameters appended to the URL. */
  query?: URLSearchParams;
  /** Optional JSON request payload. Pass `undefined` for GET / DELETE. */
  data?: Readonly<Record<string, unknown>>;
  /** Resource label for `NotFoundError` (e.g. `"webhook subscription x"`). */
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
  input: CalendlyRequestInput,
): Promise<never> {
  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Calendly ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 403) {
    throw new InsufficientScopeError(
      `Calendly ${input.method} ${input.path} returned HTTP 403 (insufficient scope or plan)`,
      "calendly",
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceCalendlyError(text, 404),
    );
  }
  if (res.status === 409) {
    const text = await res.text().catch(() => "");
    throw new ConflictError(surfaceCalendlyError(text, 409));
  }
  if (res.status === 429) {
    throw new RateLimitedError(parseRetryAfter(res));
  }
  const text = await res.text().catch(() => "");
  throw new Error(
    `Calendly ${input.method} ${input.path} failed: ${surfaceCalendlyError(text, res.status)}`,
  );
}

/**
 * Fire one Calendly API request and return the parsed JSON body.
 * DELETE returns 204 with no body; callers use `calendlyRequestVoid`.
 */
export async function calendlyRequest<T>(
  input: CalendlyRequestInput,
): Promise<T> {
  const queryString = input.query ? input.query.toString() : "";
  const url = `${calendlyApiBase()}${input.path}${queryString ? `?${queryString}` : ""}`;
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

  if (!res.ok) await throwMapped(res, input);

  return (await res.json().catch(() => ({}))) as T;
}

/**
 * Variant for endpoints that return no body on success (DELETE → 204).
 */
export async function calendlyRequestVoid(
  input: CalendlyRequestInput,
): Promise<void> {
  const queryString = input.query ? input.query.toString() : "";
  const url = `${calendlyApiBase()}${input.path}${queryString ? `?${queryString}` : ""}`;

  const res = await fetch(url, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) await throwMapped(res, input);
}
