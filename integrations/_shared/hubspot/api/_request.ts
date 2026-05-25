import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { hubspotApiBase, HUBSPOT_CRM_VERSION } from "./_base";
import { ConflictError, NotFoundError, surfaceHubSpotError } from "../errors";

/**
 * Shared HTTP request helper for HubSpot CRM v3 + Webhooks v3 wrappers.
 *
 * Slice 13 Commit 3. Mirrors `_shared/stripe/api/_request.ts` and
 * `_shared/shopify/api/_request.ts` shape — thin per-resource
 * wrappers (contacts.ts, companies.ts, deals.ts, lists.ts) construct
 * path + body and delegate to this helper for HTTP semantics + auth +
 * error mapping.
 *
 * Wire-format:
 *   - `Authorization: Bearer <token>` — standard OAuth2 bearer. The
 *     token is the merchant's decrypted access token from
 *     `integrations.access_token_encrypted`, threaded by
 *     `refreshAndRetry`'s `apiCall` callback.
 *   - `Content-Type: application/json` — HubSpot CRM v3 uses JSON
 *     in/out. Form-encoded is NOT supported for CRM v3 endpoints.
 *   - `Accept: application/json` — defensive; HubSpot defaults to JSON.
 *
 * Body handling:
 *   - GET / DELETE: no body. Query params attached via `URLSearchParams`
 *     in the optional `query` field.
 *   - POST / PATCH / PUT: the `body` object is JSON-stringified
 *     verbatim. `null` / `undefined` field values are dropped at the
 *     wrapper layer (per-resource files), not here.
 *
 * Error mapping:
 *   - 401 → `Unauthorized401Error` (caught by `refreshAndRetry` → token
 *     refresh attempt → retry once → if still 401 → typed reconnect
 *     error). HubSpot is `oauth_with_refresh`; refresh attempts are
 *     expected to succeed for non-revoked tokens.
 *   - 404 → `NotFoundError(resource)`. The `resourceForNotFound` field
 *     gives the caller a stable, user-meaningful string.
 *   - 409 → `ConflictError(resource, body)`. Surfaced for `create_*`
 *     handlers that want to recover via deterministic search +
 *     PATCH (replaces V1's brittle regex-extract-from-error-message).
 *   - Other non-OK → generic `Error("HubSpot <method> <path> failed:
 *     <message>")`. The HubSpot error envelope's `message` field is
 *     extracted via `surfaceHubSpotError`.
 */

export interface HubSpotRequestInput {
  /** Decrypted access token from the integration row. */
  accessToken: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /**
   * Path relative to the HubSpot CRM v3 / Webhooks v3 base. MUST start
   * with a leading slash. Slice 13 callers all start with `/crm/v3/...`
   * or (Commit 5) `/webhooks/v3/...`. The shared helper doesn't enforce
   * a prefix so future surfaces (Marketing / Files / etc.) can reuse
   * the same plumbing without forking.
   */
  path: string;
  /** Optional query parameters appended to the URL. */
  query?: URLSearchParams;
  /**
   * Optional JSON body object. Stringified verbatim — drop nulls /
   * undefineds at the wrapper layer if needed. Pass `undefined` for
   * GET / DELETE / endpoints that take no body.
   */
  body?: Readonly<Record<string, unknown> | readonly unknown[]>;
  /**
   * Resource label for `NotFoundError` / `ConflictError`. Pass a
   * stable, user-meaningful string like `"contact 12345"`,
   * `"company by domain"`, or `"contact (create)"`.
   */
  resourceForNotFound: string;
}

export async function hubspotRequest<T>(
  input: HubSpotRequestInput,
): Promise<T> {
  const queryString = input.query ? input.query.toString() : "";
  const url = `${hubspotApiBase()}${input.path}${queryString ? `?${queryString}` : ""}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    Accept: "application/json",
  };

  let bodyString: string | undefined;
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyString = JSON.stringify(input.body);
  }

  const res = await fetch(url, {
    method: input.method,
    headers,
    body: bodyString,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `HubSpot ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceHubSpotError(text, 404),
    );
  }
  if (res.status === 409) {
    const text = await res.text().catch(() => "");
    throw new ConflictError(input.resourceForNotFound, text);
  }
  if (res.status === 204) {
    // No content — caller chose a void return shape. JSON.parse would
    // fail on the empty body. Treat as "{}".
    return {} as T;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `HubSpot ${input.method} ${input.path} failed: ${surfaceHubSpotError(text, res.status)}`,
    );
  }

  // Read once: HubSpot CRM v3 always returns JSON on 2xx with content.
  return (await res.json()) as T;
}

/**
 * Build a CRM v3 path: `/crm/${HUBSPOT_CRM_VERSION}/${rest}`. Helper to
 * keep the version pin DRY across resource wrappers.
 *
 * Example: `crmPath("objects/contacts")` → `/crm/v3/objects/contacts`.
 */
export function crmPath(rest: string): string {
  return `/crm/${HUBSPOT_CRM_VERSION}/${rest}`;
}
