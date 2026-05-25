/**
 * HubSpot-specific error types + helpers.
 *
 * Slice 13 Commit 3. Mirrors `_shared/shopify/errors.ts`,
 * `_shared/stripe/errors.ts`, and `_shared/airtable/errors.ts` shapes —
 * per-provider error classes for the same generic categories so
 * handler-level error mapping stays provider-symmetric.
 *
 * `NotFoundError` is thrown by `_shared/hubspot/api/_request.ts` on
 * HTTP 404. Action handlers can catch and turn this into a stable
 * `{found: false}` UX (e.g. `get_*` actions that should not throw on
 * "no records"). For Slice 13 Batch 1, no action explicitly needs a
 * find-or-null shape so 404 is surfaced as an error to the caller.
 *
 * `ConflictError` is thrown by `_shared/hubspot/api/_request.ts` on
 * HTTP 409. HubSpot's CRM v3 returns 409 with a typed `category:
 * "OBJECT_ALREADY_EXISTS"` payload on duplicate-record create. The
 * `existingObjectId` field (when extracted from the error body's
 * `category: "OBJECT_ALREADY_EXISTS" → message: "Contact already
 * exists. Existing ID: 123"` or similar) is preserved for the caller
 * to use — but the caller MUST NOT rely on the regex-extracted value.
 * The contracted recovery path is deterministic search-by-property
 * (e.g. `search-by-email`) + PATCH, NOT regex extraction.
 */

export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(`HubSpot ${resource} not found${detail ? `: ${detail}` : ""}.`);
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

export class ConflictError extends Error {
  readonly resource: string;
  readonly errorBody: string;
  constructor(resource: string, errorBody: string) {
    super(`HubSpot ${resource} conflict (409): ${surfaceHubSpotError(errorBody, 409)}`);
    this.name = "ConflictError";
    this.resource = resource;
    this.errorBody = errorBody;
  }
}

/**
 * Extract a useful error string from a HubSpot CRM v3 API error
 * response. HubSpot's REST surface returns errors in a consistent shape:
 *
 *   {
 *     "status": "error",
 *     "message": "Property values were not valid: [...]",
 *     "correlationId": "...",
 *     "category": "VALIDATION_ERROR" | "OBJECT_ALREADY_EXISTS" | ...
 *   }
 *
 * Returns the `message` field when present, falls back to the `category`
 * when not, and finally to the raw HTTP status. Mirrors V1's per-handler
 * `errorData.message || response.statusText` pattern, lifted into a
 * shared helper.
 */
export function surfaceHubSpotError(text: string, status: number): string {
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
  if (typeof obj.message === "string" && obj.message.length > 0) {
    return obj.message;
  }
  if (typeof obj.category === "string" && obj.category.length > 0) {
    return obj.category;
  }
  return `HTTP ${status}`;
}
