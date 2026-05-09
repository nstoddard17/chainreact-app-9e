/**
 * Airtable typed errors thrown by API wrappers + the field-polymorphism
 * helpers — shared across the Airtable provider.
 *
 * `Unauthorized401Error` (for the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — wrappers import that one
 * directly. This file holds Airtable-shape-specific errors that
 * handlers (not the refresh wrapper) catch.
 *
 * Mirrors `_shared/notion/api/errors.ts` shape so cross-provider error
 * handling stays consistent.
 */

/**
 * Thrown by `recordsRetrieve` / `recordsUpdate` / `recordsDelete` /
 * `tablesGet` (and future resource-getters) on HTTP 404 — the
 * resource doesn't exist or the integration lacks access. Same shape
 * as Notion's NotFoundError so handler-level catch sites are uniform
 * across providers.
 */
export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Airtable resource '${resource}' not found${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

/**
 * Airtable's error envelope shape. 4xx/5xx responses look like
 * `{ error: { type, message } }` per current Airtable docs.
 *
 * See https://airtable.com/developers/web/api/errors.
 */
export interface AirtableErrorPayload {
  error?: {
    type?: string;
    message?: string;
  };
}

/**
 * Helper used by every Airtable wrapper to extract a human-readable
 * error message from a 4xx/5xx response body. Falls back to
 * `HTTP <status>` when the body isn't valid JSON or doesn't have the
 * Airtable error envelope.
 */
export function surfaceAirtableError(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as AirtableErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.type) detail = parsed.error.type;
  } catch {
    // not JSON — leave the HTTP-status fallback in place.
  }
  return detail;
}
