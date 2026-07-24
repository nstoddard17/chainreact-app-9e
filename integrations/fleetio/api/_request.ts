import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Shared HTTP request helper for Fleetio REST API wrappers (FLEETIO-1).
 *
 * Mirrors `integrations/trello/api/_request.ts` shape — thin per-resource
 * wrappers (accounts.ts, later vehicles.ts / issues.ts / …) construct path +
 * query + body and delegate here for HTTP semantics + auth + error mapping.
 *
 * **Wire-format — Fleetio specifics (developer.fleetio.com, 2025-05-05):**
 *
 *   - TWO auth headers on every call: `Authorization: Token <apiKey>` (the
 *     literal word `Token`) and `Account-Token: <accountToken>`. The ONE
 *     exception is `GET /accounts`, which authenticates with the API key
 *     alone (pass `accountToken: null`) — that is what connect-time
 *     verification uses.
 *   - `X-Api-Version` is PINNED to `2025-05-05` on every request so behavior
 *     is deterministic regardless of the API key's own locked version.
 *   - Base URL `https://secure.fleetio.com/api` (HTTPS only; paths carry no
 *     version segment as of 2025-05-05).
 *
 * **Error mapping:**
 *
 *   - 401 → `Unauthorized401Error` (Fleetio is non-refreshable, so the
 *     execution helper surfaces "reconnect Fleetio" when actions land).
 *   - 403 → `FleetioForbiddenError` — the integration user's Fleetio ROLE
 *     lacks the permission (distinct from a dead key; the fix is a role
 *     change in Fleetio, not a reconnect).
 *   - 404 → `FleetioNotFoundError(resource)` so handlers can surface a stable
 *     "not found" UX for a bad/removed id (FLEETIO-2).
 *   - 429 → METHOD-AWARE (FLEETIO-3 write-safety): for an idempotent **GET**,
 *     honors `Retry-After` with ONE bounded inline retry (delay ≤
 *     `MAX_RETRY_AFTER_SECONDS`). For any **write** (PATCH/POST/PUT/DELETE) it
 *     NEVER auto-replays — it throws `FleetioRateLimitError` immediately
 *     (carrying the parsed delay) so a mutation is never duplicated (Fleetio has
 *     no idempotency key for vehicle updates). A second GET 429 also throws.
 *   - Timeout / network failure → generic Error naming only method + path.
 *
 * **Credential-leakage discipline (mirrors Trello):** no thrown error message
 * ever contains the API key, the Account-Token, a full URL, or raw response
 * headers. Errors reference ONLY the method + path (no query) + a bounded,
 * surfaced provider message.
 */

const FLEETIO_API_BASE = "https://secure.fleetio.com/api";
/** Pinned Fleetio API version (date-based). Bump deliberately, never implicitly. */
export const FLEETIO_API_VERSION = "2025-05-05";
/** Hard per-request timeout. */
const REQUEST_TIMEOUT_MS = 15_000;
/** Longest Retry-After we will honor inline; anything larger surfaces as an error. */
const MAX_RETRY_AFTER_SECONDS = 10;
/** Bound on how much of a provider error body we surface into error messages. */
const MAX_SURFACED_ERROR_CHARS = 200;

/** 403 — the Fleetio user's role lacks the permission for this call. */
export class FleetioForbiddenError extends Error {
  constructor(method: string, path: string) {
    super(
      `Fleetio ${method} ${path} returned HTTP 403 — the connected Fleetio user's role does not allow this.`,
    );
    this.name = "FleetioForbiddenError";
  }
}

/**
 * The provider returned a 2xx whose body doesn't match the expected shape
 * (e.g. an update response missing the vehicle id). Carries only a stable
 * caller label — never the raw response body. Callers must NOT emit fabricated
 * output when this is thrown.
 */
export class FleetioMalformedResponseError extends Error {
  readonly resource: string;
  constructor(resource: string) {
    super(`Fleetio returned an unexpected response for ${resource}.`);
    this.name = "FleetioMalformedResponseError";
    this.resource = resource;
  }
}

/**
 * 404 — the addressed resource does not exist (bad / removed id). Carries a
 * caller-supplied stable resource label ONLY (e.g. "vehicle 42") — never the
 * request URL or any credential.
 */
export class FleetioNotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string) {
    super(`Fleetio resource not found: ${resource}.`);
    this.name = "FleetioNotFoundError";
    this.resource = resource;
  }
}

/** 429 that could not be absorbed by the single bounded inline retry. */
export class FleetioRateLimitError extends Error {
  readonly retryAfterSeconds: number | null;
  constructor(method: string, path: string, retryAfterSeconds: number | null) {
    super(
      `Fleetio ${method} ${path} was rate limited (HTTP 429)${
        retryAfterSeconds !== null ? `; retry after ${retryAfterSeconds}s` : ""
      }.`,
    );
    this.name = "FleetioRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface FleetioRequestInput {
  /** Decrypted Fleetio API key (`Authorization: Token <apiKey>`). */
  apiKey: string;
  /**
   * Decrypted Fleetio Account-Token header. Pass `null` ONLY for the
   * documented account-token-free endpoints (`GET /accounts`).
   */
  accountToken: string | null;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Path relative to the API base, starting with `/` (e.g. `/accounts`). */
  path: string;
  /** Optional query parameters (never credential material). */
  query?: URLSearchParams;
  /** Optional JSON body. */
  body?: Readonly<Record<string, unknown>>;
  /**
   * Optional stable resource label for `FleetioNotFoundError` (e.g.
   * "vehicle 42"). When set, a 404 throws that typed error; when omitted a
   * 404 falls through to the generic non-OK path. Used in the thrown error's
   * message ONLY — never placed in the request URL or body.
   */
  resourceForNotFound?: string;
}

/** Parse a Retry-After header value (seconds form only) to a non-negative int. */
function parseRetryAfterSeconds(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.ceil(n);
}

/** Bounded, credential-free surfacing of a Fleetio error body. */
function surfaceFleetioError(bodyText: string, status: number): string {
  const trimmed = bodyText.trim();
  if (trimmed.length === 0) return `HTTP ${status}`;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const message =
      (typeof parsed.error === "string" && parsed.error) ||
      (typeof parsed.message === "string" && parsed.message) ||
      trimmed;
    return String(message).slice(0, MAX_SURFACED_ERROR_CHARS);
  } catch {
    return trimmed.slice(0, MAX_SURFACED_ERROR_CHARS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fleetioRequest<T>(input: FleetioRequestInput): Promise<T> {
  return fleetioRequestAttempt<T>(input, /* retriedAfter429 */ false);
}

async function fleetioRequestAttempt<T>(
  input: FleetioRequestInput,
  retriedAfter429: boolean,
): Promise<T> {
  const queryString = input.query?.toString() ?? "";
  const url = `${FLEETIO_API_BASE}${input.path}${queryString ? `?${queryString}` : ""}`;

  const headers: Record<string, string> = {
    Authorization: `Token ${input.apiKey}`,
    "X-Api-Version": FLEETIO_API_VERSION,
    Accept: "application/json",
  };
  if (input.accountToken !== null) {
    headers["Account-Token"] = input.accountToken;
  }
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: input.method,
      headers,
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Timeout or network failure — no URL / header / credential in the message.
    const kind =
      err instanceof Error && err.name === "TimeoutError" ? "timed out" : "network failure";
    throw new Error(`Fleetio ${input.method} ${input.path} ${kind}`);
  }

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Fleetio ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 403) {
    throw new FleetioForbiddenError(input.method, input.path);
  }
  if (res.status === 404 && input.resourceForNotFound !== undefined) {
    // Drain the body (no leak — we surface only the caller's stable label).
    await res.text().catch(() => "");
    throw new FleetioNotFoundError(input.resourceForNotFound);
  }
  if (res.status === 429) {
    const retryAfter = parseRetryAfterSeconds(res.headers.get("Retry-After"));
    // WRITE-SAFETY (FLEETIO-3): only auto-retry IDEMPOTENT methods (GET). A
    // non-idempotent write (PATCH/POST/PUT/DELETE) is NEVER auto-replayed on a
    // 429 — Fleetio exposes no idempotency key for vehicle updates, so a blind
    // replay could duplicate the mutation. Writes surface FleetioRateLimitError
    // immediately (carrying the parsed delay) so the caller/engine can decide.
    const methodIsRetryable = input.method === "GET";
    if (
      methodIsRetryable &&
      !retriedAfter429 &&
      retryAfter !== null &&
      retryAfter <= MAX_RETRY_AFTER_SECONDS
    ) {
      await sleep(retryAfter * 1000);
      return fleetioRequestAttempt<T>(input, true);
    }
    throw new FleetioRateLimitError(input.method, input.path, retryAfter);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Fleetio ${input.method} ${input.path} failed: ${surfaceFleetioError(text, res.status)}`,
    );
  }

  const text = await res.text();
  if (text.length === 0) {
    return undefined as unknown as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Fleetio ${input.method} ${input.path} returned non-JSON 2xx body`);
  }
}
