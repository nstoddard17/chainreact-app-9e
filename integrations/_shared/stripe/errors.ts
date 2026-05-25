/**
 * Stripe typed errors thrown by API wrappers — shared across the
 * Stripe provider.
 *
 * `Unauthorized401Error` (for the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — wrappers import that one
 * directly. This file holds Stripe-shape-specific errors that
 * handlers (not the refresh wrapper) catch.
 *
 * Mirrors `_shared/airtable/errors.ts` and `_shared/notion/api/errors.ts`
 * shape so cross-provider error handling stays consistent.
 */

/**
 * Thrown by GET-by-id wrappers (`customersGet`, `subscriptionsGet`,
 * etc.) on HTTP 404 — the resource doesn't exist or the merchant's
 * Stripe account doesn't have access. Same shape as Airtable / Notion
 * NotFoundError so handler-level catch sites are uniform across
 * providers.
 */
export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Stripe resource '${resource}' not found${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

/**
 * Stripe's error envelope shape. 4xx / 5xx responses look like
 * `{ error: { type, code, message, param, doc_url, ... } }` per
 * current Stripe docs.
 *
 * See https://docs.stripe.com/api/errors.
 */
export interface StripeErrorPayload {
  error?: {
    type?: string;
    code?: string;
    message?: string;
    param?: string;
    doc_url?: string;
  };
}

/**
 * Helper used by every Stripe wrapper to extract a human-readable
 * error message from a 4xx / 5xx response body. Falls back to
 * `HTTP <status>` when the body isn't valid JSON or doesn't have the
 * Stripe error envelope.
 *
 * Prefers `message` (most actionable) → `code` → `type` → status.
 */
export function surfaceStripeError(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as StripeErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.code) detail = parsed.error.code;
    else if (parsed?.error?.type) detail = parsed.error.type;
  } catch {
    // not JSON — leave the HTTP-status fallback in place.
  }
  return detail;
}
