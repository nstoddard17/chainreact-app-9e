import {
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError, RateLimitedError, surfaceTypeformError } from "../errors";

/**
 * Shared HTTP request helper for the Typeform REST API — Slice
 * 5.TYPEFORM-1.
 *
 * Mirrors `_shared/asana/api/_request.ts` shape: thin per-resource
 * wrappers (forms.ts, webhooks.ts) construct path + body and delegate
 * here for HTTP semantics + auth + error mapping.
 *
 * Wire-format (docs/providers/typeform/research.md):
 *   - Base: `https://api.typeform.com` (TYPEFORM_API_BASE override for
 *     e2e mocks; production never sets it). No version segment. EU
 *     data-center hosts are a documented limitation this slice.
 *   - `Authorization: Bearer <token>` — decrypted access token threaded
 *     by `refreshAndRetry`'s `apiCall` callback.
 *   - JSON in/out, NO envelope (contrast Asana's `{ data: … }`).
 *
 * Error mapping:
 *   - 401 → `Unauthorized401Error` (caught by `refreshAndRetry` → one
 *     refresh + retry; Typeform access tokens expire weekly).
 *   - 403 → `InsufficientScopeError` (a refresh keeps the same granted
 *     scopes; needs re-consent). Body NOT surfaced.
 *   - 404 → `NotFoundError(resourceForNotFound)`.
 *   - 429 → `RateLimitedError(retryAfterSeconds)` — 2 req/s per account;
 *     Retry-After parsed defensively (header undocumented).
 *   - Other non-OK → generic Error with the envelope's `description`
 *     via `surfaceTypeformError` (never the raw body).
 */

function typeformApiBase(): string {
  return process.env.TYPEFORM_API_BASE ?? "https://api.typeform.com";
}

export interface TypeformRequestInput {
  /** Decrypted access token from the integration row. */
  accessToken: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Path relative to the API base. MUST start with a leading slash. */
  path: string;
  /** Optional query parameters appended to the URL. */
  query?: URLSearchParams;
  /** Optional JSON request payload. Pass `undefined` for GET / DELETE. */
  data?: Readonly<Record<string, unknown>>;
  /** Resource label for `NotFoundError` (e.g. `"form abc123"`). */
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
  input: TypeformRequestInput,
): Promise<never> {
  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Typeform ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 403) {
    throw new InsufficientScopeError(
      `Typeform ${input.method} ${input.path} returned HTTP 403 (insufficient scope)`,
      "typeform",
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceTypeformError(text, 404),
    );
  }
  if (res.status === 429) {
    throw new RateLimitedError(parseRetryAfter(res));
  }
  const text = await res.text().catch(() => "");
  throw new Error(
    `Typeform ${input.method} ${input.path} failed: ${surfaceTypeformError(text, res.status)}`,
  );
}

/**
 * Fire one Typeform API request and return the parsed JSON body.
 * DELETE returns 204 with no body; callers use `typeformRequestVoid`.
 */
export async function typeformRequest<T>(
  input: TypeformRequestInput,
): Promise<T> {
  const queryString = input.query ? input.query.toString() : "";
  const url = `${typeformApiBase()}${input.path}${queryString ? `?${queryString}` : ""}`;
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
export async function typeformRequestVoid(
  input: TypeformRequestInput,
): Promise<void> {
  const queryString = input.query ? input.query.toString() : "";
  const url = `${typeformApiBase()}${input.path}${queryString ? `?${queryString}` : ""}`;

  const res = await fetch(url, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) await throwMapped(res, input);
}
