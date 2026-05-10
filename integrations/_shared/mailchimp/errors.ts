/**
 * Mailchimp-specific error types + helpers.
 *
 * Slice 14 Commit 2. Mirrors `_shared/hubspot/errors.ts`,
 * `_shared/shopify/errors.ts`, `_shared/stripe/errors.ts` shapes —
 * per-provider error classes for the same generic categories so
 * handler-level error mapping stays provider-symmetric.
 *
 * `MissingDataCenterError` is thrown by `_shared/mailchimp/api/_base.ts`
 * when an API call is attempted but the integration row's stored
 * `dc` (datacenter) value is missing. Mailchimp's per-account
 * datacenter prefix (`us1`, `us2`, …, `eu1`, …) is required to
 * construct the API URL; without it, every wire call would silently
 * route to `https://undefined.api.mailchimp.com/...`. V1's
 * [`utils.ts:37-75`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/utils.ts#L37)
 * runtime-refetches dc as a fallback; V2 captures dc deterministically
 * at OAuth callback and fails loud here so the user sees a "reconnect
 * Mailchimp" prompt instead of silent network errors.
 *
 * `NotFoundError` + `ConflictError` are Mailchimp's 404 / 409 wire
 * shapes — wired up by Slice 14 Commit 3 when action handlers ship.
 * Kept here so the error taxonomy stays provider-symmetric with
 * HubSpot / Shopify / Stripe at Commit 2 time.
 *
 * `surfaceMailchimpError` parses the Marketing API's typed error
 * envelope shape:
 *   {
 *     "type": "https://mailchimp.com/developer/marketing/docs/errors/",
 *     "title": "Member Exists",
 *     "status": 400,
 *     "detail": "user@example.com is already a list member ...",
 *     "instance": "..."
 *   }
 * Returns `detail` when present (most actionable), falls back to
 * `title`, finally to the raw HTTP status. Mirrors V1's per-handler
 * `errorData.detail || errorData.title || HTTP ${status}` pattern
 * across `lib/workflows/actions/mailchimp/*.ts`.
 */

export class MissingDataCenterError extends Error {
  constructor() {
    super(
      "Mailchimp integration is missing the datacenter (dc) value on its account metadata. " +
        "The dc is captured at OAuth callback; if it's missing here the integration row was " +
        "created before V2's dc-routing landed or the metadata has drifted. " +
        "Reconnect the Mailchimp account to refresh the dc.",
    );
    this.name = "MissingDataCenterError";
  }
}

export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(`Mailchimp ${resource} not found${detail ? `: ${detail}` : ""}.`);
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

export class ConflictError extends Error {
  readonly resource: string;
  readonly errorBody: string;
  constructor(resource: string, errorBody: string) {
    super(
      `Mailchimp ${resource} conflict (400/409): ${surfaceMailchimpError(errorBody, 400)}`,
    );
    this.name = "ConflictError";
    this.resource = resource;
    this.errorBody = errorBody;
  }
}

/**
 * Extract a useful error string from a Mailchimp Marketing API error
 * response body. Returns the `detail` field when present (most
 * actionable for the end user), falls back to `title`, and finally
 * to the raw HTTP status code. Mirrors V1's pattern across every
 * action handler.
 */
export function surfaceMailchimpError(text: string, status: number): string {
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
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.detail === "string" && obj.detail.length > 0) {
    return obj.detail;
  }
  if (typeof obj.title === "string" && obj.title.length > 0) {
    return obj.title;
  }
  return `HTTP ${status}`;
}
