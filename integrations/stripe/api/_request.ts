import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  STRIPE_API_VERSION,
  stripeApiBase,
} from "@/integrations/_shared/stripe/api/_base";
import {
  NotFoundError,
  surfaceStripeError,
} from "@/integrations/_shared/stripe/errors";
import { flattenForStripe } from "@/integrations/_shared/stripe/flattenForStripe";

/**
 * Shared HTTP request helper for Stripe API wrappers.
 *
 * Every Stripe `/v1/*` request needs:
 *   - `Authorization: Bearer ${accessToken}` (the merchant's connected-account
 *     OAuth access token from `integrations.access_token_encrypted`).
 *   - `Stripe-Version: <pinned>` (Slice 11 manifest's `apiVersion`).
 *   - `Content-Type: application/x-www-form-urlencoded` for POST / DELETE
 *     bodies. Stripe rejects `application/json` on the REST surface — its
 *     wire-format is bracket-notation form-encoded.
 *   - Optional `Idempotency-Key: <key>` for create-style POSTs (Stripe's
 *     24-hour server-side dedup window).
 *
 * Centralizing here ensures every wrapper sends the same headers and
 * maps 401 / 404 / other errors uniformly. Per-resource wrappers
 * (`customers.ts`, `paymentIntents.ts`, `refunds.ts`, `subscriptions.ts`)
 * thin-wrap this with URL + body construction.
 *
 * Body handling:
 *   - GET: never carries a body. Query params go on the URL via the
 *     `query` field.
 *   - POST / DELETE: optional `body` object is flattened via
 *     `flattenForStripe` and serialized as `URLSearchParams.toString()`.
 *     `null` / `undefined` field values are dropped at the flatten layer.
 *   - Empty `body` (`{}` or `undefined`) → no body sent. DELETE with
 *     query params + no body is the cancel-subscription pattern.
 *
 * Error mapping:
 *   - 401 → `Unauthorized401Error` (caught by refreshAndRetry; for
 *     Stripe surfaces as `IntegrationActionRequiredError(reason:
 *     "refresh_failed")` only after the second 401 — the refresh path
 *     is exercised first).
 *   - 404 → `NotFoundError(resource)` so handlers can give a stable
 *     "not found" UX. find_customer turns this into `{found: false}`
 *     rather than propagating.
 *   - Other non-OK → generic `Error("Stripe <method> <path> failed:
 *     ${parsedMessage}")`. The Stripe error envelope's `message` /
 *     `code` / `type` is extracted via `surfaceStripeError`.
 *
 * Mirrors `integrations/airtable/api/_request.ts` and
 * `integrations/notion/api/_request.ts` shape — proves the
 * per-provider thin-request-wrapper pattern generalizes across
 * JSON-body (Airtable / Notion) and form-encoded-body (Stripe)
 * providers.
 */

export interface StripeRequestInput {
  accessToken: string;
  method: "GET" | "POST" | "DELETE";
  /** Path relative to `api.stripe.com`, e.g. `/v1/customers`. */
  path: string;
  /** Optional query parameters appended to the URL. */
  query?: URLSearchParams;
  /**
   * Optional body object. Flattened to bracket notation and
   * form-encoded automatically. Pass `undefined` for GET or for POST /
   * DELETE that carry no body (Stripe accepts empty-body POSTs on a
   * few endpoints — confirm / capture without options, refresh).
   */
  body?: Readonly<Record<string, unknown>>;
  /**
   * Optional Idempotency-Key header (Stripe's 24-hour server-side
   * dedup window). Set for create-style actions; omit for updates,
   * confirms, captures, deletes (those are inherently idempotent on
   * the resource id).
   */
  idempotencyKey?: string;
  /**
   * Resource label for `NotFoundError`. Pass a stable, user-meaningful
   * string like `"customer cus_X"` or `"subscription sub_Y"`.
   */
  resourceForNotFound: string;
}

export async function stripeRequest<T>(
  input: StripeRequestInput,
): Promise<T> {
  const queryString = input.query ? input.query.toString() : "";
  const url = `${stripeApiBase()}${input.path}${queryString ? `?${queryString}` : ""}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };

  let bodyString: string | undefined;
  if (input.body !== undefined) {
    const flat = flattenForStripe(input.body);
    // Stripe accepts an empty-form POST body — skip the
    // Content-Type + body when the flattened shape is empty rather
    // than sending an empty body with form-encoded content type
    // (Stripe is tolerant either way; this keeps the wire clean).
    if (Object.keys(flat).length > 0) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      bodyString = new URLSearchParams(flat).toString();
    }
  }

  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey;
  }

  const res = await fetch(url, {
    method: input.method,
    headers,
    body: bodyString,
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      `Stripe ${input.method} ${input.path} returned HTTP 401`,
    );
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError(
      input.resourceForNotFound,
      surfaceStripeError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Stripe ${input.method} ${input.path} failed: ${surfaceStripeError(text, res.status)}`,
    );
  }

  // Successful 2xx — parse JSON body. Stripe always responds with
  // JSON regardless of request content-type.
  return (await res.json()) as T;
}
