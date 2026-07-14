import {
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { quickbooksApiBase } from "@/integrations/quickbooks/oauth";
import {
  NotFoundError,
  QuickbooksApiError,
  RateLimitedError,
  logQuickbooksApiError,
  readIntuitTid,
  surfaceQuickbooksError,
} from "../errors";

/**
 * Shared HTTP request helper for the QuickBooks Online Accounting API —
 * QUICKBOOKS-1.
 *
 * Mirrors `_shared/typeform/api/_request.ts` shape: thin per-resource
 * wrappers (customers.ts, invoices.ts, …) construct path + body and
 * delegate here for HTTP semantics + auth + error mapping.
 *
 * Wire-format (docs/providers/quickbooks/research.md):
 *   - Base: `https://quickbooks.api.intuit.com` (QUICKBOOKS_API_BASE
 *     override — the SANDBOX base when running with Development keys, or
 *     e2e mocks). Every path is company-scoped:
 *     `/v3/company/{realmId}/<resource>` — the realmId is REQUIRED here
 *     so a wrapper can never fire an unscoped call.
 *   - `minorversion=75` is appended to EVERY request (minor versions
 *     1–74 deprecated 2025-08-01; 75 is the served base).
 *   - `Authorization: Bearer <token>` — decrypted access token threaded
 *     by `refreshAndRetry`'s `apiCall` callback.
 *   - JSON in/out. The `/send` endpoint is the one exception: Intuit
 *     documents `Content-Type: application/octet-stream` with an empty
 *     body — callers pass `octetStream: true`.
 *
 * Error mapping:
 *   - 401 → `Unauthorized401Error` (caught by `refreshAndRetry` → one
 *     refresh + retry; access tokens expire after 60 minutes).
 *   - 403 → `InsufficientScopeError` (a refresh keeps the same granted
 *     scopes; needs re-consent). Body NOT surfaced.
 *   - 404 → `NotFoundError(resourceForNotFound)`.
 *   - 429 → `RateLimitedError(retryAfterSeconds)` — 500 req/min per
 *     realm; Retry-After parsed defensively (header undocumented).
 *   - Other non-OK → `QuickbooksApiError` with the Fault envelope's first
 *     `Message (code n)` via `surfaceQuickbooksError` (never the raw
 *     body — `Fault.Error[].Detail` embeds entity field values and is
 *     deliberately dropped).
 *
 * `intuit_tid` capture: the `intuit_tid` response header (Intuit's
 * transaction/correlation id) is read from EVERY response and, on failure,
 * written to a sanitized `quickbooks.api.error` troubleshooting log and
 * carried on the QB-owned error classes' `intuitTid` field. It is an opaque,
 * non-sensitive id — never logged alongside the token/Authorization header or
 * raw body, and never surfaced into workflow outputs or UI.
 */

export interface QuickbooksRequestInput {
  /** Decrypted access token from the integration row. */
  accessToken: string;
  /** Company id — every Accounting API call is scoped by it. */
  realmId: string;
  method: "GET" | "POST";
  /**
   * Path relative to `/v3/company/{realmId}` — MUST start with a leading
   * slash (e.g. `/customer/42`, `/query`, `/invoice/145/send`).
   */
  path: string;
  /** Optional query parameters (minorversion is appended automatically). */
  query?: URLSearchParams;
  /** Optional JSON request payload. */
  data?: Readonly<Record<string, unknown>>;
  /**
   * The invoice `/send` endpoint's documented content type. Sends an
   * empty `application/octet-stream` body instead of JSON.
   */
  octetStream?: boolean;
  /** Resource label for `NotFoundError` (e.g. `"invoice 145"`). */
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
  input: QuickbooksRequestInput,
  intuitTid: string | null,
): Promise<never> {
  // Sanitized troubleshooting line for EVERY non-OK status — carries the
  // Intuit correlation id + coarse coordinates only (no token/Authorization/
  // body). 401/403 are cross-provider error classes that don't carry the tid
  // themselves, so this log is where their correlation id is preserved.
  logQuickbooksApiError({
    method: input.method,
    path: input.path,
    status: res.status,
    intuitTid,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `QuickBooks ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 403) {
    throw new InsufficientScopeError(
      `QuickBooks ${input.method} ${input.path} returned HTTP 403 (insufficient scope)`,
      "quickbooks",
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceQuickbooksError(text, 404),
      intuitTid,
    );
  }
  if (res.status === 429) {
    throw new RateLimitedError(parseRetryAfter(res), intuitTid);
  }
  const text = await res.text().catch(() => "");
  throw new QuickbooksApiError(
    res.status,
    `QuickBooks ${input.method} ${input.path} failed: ${surfaceQuickbooksError(text, res.status)}`,
    intuitTid,
  );
}

/**
 * Escape a user-supplied value for interpolation into a QuickBooks query
 * statement string literal. Intuit's documented escape is a backslash
 * before the single quote (`Adam\'s`); backslashes themselves are doubled
 * first so a trailing user backslash can't neutralize the closing quote.
 * Exported for the wrapper modules and their tests — user input NEVER
 * reaches a query string except through this.
 */
export function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Fire one Accounting API request and return the parsed JSON body. */
export async function quickbooksRequest<T>(
  input: QuickbooksRequestInput,
): Promise<T> {
  const query = new URLSearchParams(input.query);
  query.set("minorversion", "75");
  const url = `${quickbooksApiBase()}/v3/company/${encodeURIComponent(input.realmId)}${input.path}?${query.toString()}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    Accept: "application/json",
  };

  let bodyString: string | undefined;
  if (input.octetStream) {
    headers["Content-Type"] = "application/octet-stream";
    bodyString = "";
  } else if (input.data !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyString = JSON.stringify(input.data);
  }

  const res = await fetch(url, {
    method: input.method,
    headers,
    body: bodyString,
  });

  // Capture Intuit's transaction/correlation id from EVERY response (present
  // on success and failure). Used only for sanitized troubleshooting logs +
  // error metadata below — never surfaced into workflow outputs or UI.
  const intuitTid = readIntuitTid(res);

  if (!res.ok) await throwMapped(res, input, intuitTid);

  return (await res.json().catch(() => ({}))) as T;
}
