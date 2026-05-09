import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { shopifyApiBase } from "./_base";
import { NotFoundError, surfaceShopifyError } from "../errors";

/**
 * Shared HTTP request helper for Shopify Admin REST API wrappers.
 *
 * Slice 12 Commit 3. Mirrors `_shared/stripe/api/_request.ts` shape —
 * thin per-resource wrappers in this folder construct path + body and
 * delegate to this helper for HTTP semantics + auth + error mapping.
 *
 * Headers (per Shopify Admin REST docs):
 *   - `X-Shopify-Access-Token: <token>` — Shopify uses a custom header
 *     name, NOT `Authorization: Bearer`. The token comes from
 *     `getActiveForExecution(...).accessTokenEncrypted` after
 *     `decryptToken`, threaded by `refreshAndRetry`'s `apiCall`.
 *   - `Content-Type: application/json` — Shopify accepts JSON bodies
 *     across the Admin REST surface (orders, products, customers,
 *     fulfillments, inventory_levels). Form-encoded would also work
 *     but JSON keeps body construction simple.
 *   - `Accept: application/json` — defensive; Shopify defaults to JSON.
 *
 * Per-shop URL routing is the distinguishing feature: every wrapper
 * supplies the `shopDomain` from the integration row's
 * `providerAccountId`, and `_request` constructs
 * `https://{shopDomain}/admin/api/2024-10/{path}`. Action config can
 * NEVER override the shop — the shop is sourced exclusively from the
 * integration row.
 *
 * Body handling:
 *   - GET / DELETE: never carries a body. Query params go on the URL
 *     via the optional `query` field.
 *   - POST / PUT: the `body` object is JSON-stringified verbatim.
 *     `null` / `undefined` field values are dropped at the wrapper
 *     layer (per-resource files), not here, so each wrapper has
 *     explicit control over which optional fields to include.
 *
 * Error mapping:
 *   - 401 → `Unauthorized401Error` (caught by `refreshAndRetry`).
 *     For Shopify (non-refreshable per Slice 12 Commit 2), this
 *     surfaces as `IntegrationActionRequiredError(reason:
 *     "refresh_not_supported")` — the user's prompt is "reconnect
 *     your Shopify account."
 *   - 404 → `NotFoundError(resource)` so handlers can give a stable
 *     "not found" UX or surface a clear error.
 *   - Other non-OK → generic `Error("Shopify <method> <path> failed:
 *     ${surfaceShopifyError(text, status)}")`. The Shopify error
 *     envelope's `errors` field is extracted via `surfaceShopifyError`
 *     (see `_shared/shopify/errors.ts`).
 */

export interface ShopifyRequestInput {
  /**
   * Full `*.myshopify.com` shop domain. Sourced exclusively from
   * `integrations.providerAccountId` (set at OAuth callback time per
   * Slice 12 Commit 2). Action config CANNOT override.
   */
  shopDomain: string;
  /** Decrypted merchant access token from the integration row. */
  accessToken: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  /**
   * Path relative to the shop's `/admin/api/{version}` base, e.g.
   * `/orders.json`. MUST start with a leading slash.
   */
  path: string;
  /** Optional query parameters appended to the URL. */
  query?: URLSearchParams;
  /**
   * Optional JSON body object. Stringified verbatim — drop nulls /
   * undefineds at the wrapper layer if needed. Pass `undefined` for
   * GET / DELETE or for POST endpoints that take no body.
   */
  body?: Readonly<Record<string, unknown>>;
  /**
   * Resource label for `NotFoundError`. Pass a stable, user-meaningful
   * string like `"order 12345"` or `"customer 67890"`.
   */
  resourceForNotFound: string;
}

export async function shopifyRequest<T>(
  input: ShopifyRequestInput,
): Promise<T> {
  const queryString = input.query ? input.query.toString() : "";
  const url = `${shopifyApiBase(input.shopDomain)}${input.path}${queryString ? `?${queryString}` : ""}`;
  const headers: Record<string, string> = {
    "X-Shopify-Access-Token": input.accessToken,
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
      `Shopify ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceShopifyError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Shopify ${input.method} ${input.path} failed: ${surfaceShopifyError(text, res.status)}`,
    );
  }

  // Shopify always responds with JSON for the Admin REST surface (even
  // empty 200 ack endpoints return `{}`). 204 No Content is rare on
  // the surfaces Slice 12 ships against — handlers that hit one
  // should adapt the wrapper. For Batch 1 we always JSON-parse.
  return (await res.json()) as T;
}
