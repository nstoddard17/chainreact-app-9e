import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { airtableApiBase } from "@/integrations/_shared/airtable/api/_base";
import {
  NotFoundError,
  surfaceAirtableError,
} from "@/integrations/_shared/airtable/errors";

/**
 * Shared HTTP request helper for Airtable API wrappers.
 *
 * Every Airtable `/v0/*` request needs:
 *   - `Authorization: Bearer ${accessToken}`
 *   - `Content-Type: application/json` for POST/PATCH/DELETE bodies
 *
 * Centralizing here ensures every wrapper sends the same headers and
 * maps 401 / 404 / other errors uniformly. Per-resource wrappers
 * (records.ts, bases.ts, tables.ts) thin-wrap this with URL + body
 * construction.
 *
 * Error mapping:
 *   - 401 → `Unauthorized401Error` (caught by refreshAndRetry; for
 *     Airtable surfaces as `IntegrationActionRequiredError(reason:
 *     "refresh_failed")` only after the second 401 — the rotation-
 *     enforced refresh path is exercised first).
 *   - 404 → `NotFoundError(resource)` so handlers can give a stable
 *     "not found" UX.
 *   - Other non-OK → generic `Error("Airtable <method> <path>
 *     failed: ${parsedMessage}")`.
 *
 * Mirrors `integrations/notion/api/_request.ts` shape — proves the
 * per-provider thin-request-wrapper pattern generalizes.
 */

export interface AirtableRequestInput {
  accessToken: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Path relative to api.airtable.com, e.g. `/v0/{baseId}/{table}`. */
  path: string;
  /** Optional query parameters appended to the URL. */
  query?: URLSearchParams;
  /** Optional JSON body. Omit / undefined for GET / DELETE. */
  body?: unknown;
  /**
   * Resource label for `NotFoundError`. Pass a stable, user-meaningful
   * string like `"record <id>"` or `"base <id>"`.
   */
  resourceForNotFound: string;
}

export async function airtableRequest<T>(
  input: AirtableRequestInput,
): Promise<T> {
  const queryString = input.query ? input.query.toString() : "";
  const url = `${airtableApiBase()}${input.path}${queryString ? `?${queryString}` : ""}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
  };
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method: input.method,
    headers,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Airtable ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceAirtableError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Airtable ${input.method} ${input.path} failed: ${surfaceAirtableError(text, res.status)}`,
    );
  }

  // Successful 2xx — parse JSON body. Airtable returns `{ deleted,
  // id }` on DELETE, full record on POST/PATCH/GET, list shape on the
  // index endpoint, all JSON.
  return (await res.json()) as T;
}

/**
 * Encode a path segment that may contain a table name or id. Airtable
 * accepts both `tblXXXXXXXXX` ids and human-readable table names.
 * Names may contain spaces, slashes, or other URL-significant
 * characters, so always run through `encodeURIComponent`. The id
 * pattern survives encoding unchanged (no special chars).
 */
export function encodeTableSegment(idOrName: string): string {
  return encodeURIComponent(idOrName);
}
