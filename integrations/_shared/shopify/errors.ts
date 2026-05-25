/**
 * Shopify-specific error types + helpers.
 *
 * Slice 12 Commit 3. Mirrors `_shared/stripe/errors.ts` and
 * `_shared/airtable/errors.ts` shapes — per-provider error classes for
 * the same generic categories so handler-level error mapping stays
 * provider-symmetric.
 *
 * `NotFoundError` is thrown by `_shared/shopify/api/_request.ts` on
 * HTTP 404. Action handlers can catch and turn this into a stable
 * `{found: false}` UX (e.g. find_customer-style actions). For Slice
 * 12 Batch 1, no action explicitly needs a `find_*` shape so 404 is
 * surfaced as an error to the caller.
 */

export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(`Shopify ${resource} not found${detail ? `: ${detail}` : ""}.`);
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

/**
 * Extract a useful error string from a Shopify Admin API error
 * response. Shopify's REST surface returns errors in a few shapes:
 *
 *   - `{ "errors": "Order not found" }`  — top-level string
 *   - `{ "errors": ["msg1", "msg2"] }`   — top-level array
 *   - `{ "errors": { "field": ["msg"] } }` — per-field map (422)
 *   - HTML body (rate-limit / 5xx) — falls through to the raw status
 *
 * Returns the first useful message, or the raw status if nothing
 * parses cleanly. Mirrors V1's `extractShopifyValidationMessage`
 * (`app/api/integrations/shopify/data/utils.ts:208-231`) but typed
 * and pure — no logging side effects.
 */
export function surfaceShopifyError(text: string, status: number): string {
  if (!text) return `HTTP ${status}`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return `HTTP ${status}`;
  }
  if (parsed === null || typeof parsed !== "object") {
    return `HTTP ${status}`;
  }
  const errors = (parsed as Record<string, unknown>).errors;
  if (typeof errors === "string") return errors;
  if (Array.isArray(errors)) {
    const first = errors[0];
    if (typeof first === "string") return first;
  }
  if (errors !== null && typeof errors === "object" && !Array.isArray(errors)) {
    for (const [field, value] of Object.entries(errors as Record<string, unknown>)) {
      if (Array.isArray(value) && typeof value[0] === "string") {
        return `${field}: ${value[0]}`;
      }
      if (typeof value === "string") return `${field}: ${value}`;
    }
  }
  return `HTTP ${status}`;
}
