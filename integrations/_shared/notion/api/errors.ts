/**
 * Notion API typed errors thrown by HTTP wrappers — shared across the
 * Notion provider.
 *
 * `Unauthorized401Error` (for the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — wrappers import that one
 * directly. This file holds Notion-shape-specific errors that handlers
 * (not the refresh wrapper) catch.
 *
 * Mirrors Microsoft / Google `_shared/<vendor>/api/errors.ts` shape so
 * cross-provider error handling stays consistent.
 */

/**
 * Thrown by `pagesRetrieve` / `databasesQuery` (and future
 * resource-getters) on HTTP 404 — the resource doesn't exist or the
 * integration lacks access to it. Notion uses 404 to avoid leaking
 * existence; both cases surface as NotFoundError so handlers can give
 * the same "we couldn't find that" UX regardless of which sub-cause
 * fired.
 */
export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Notion resource '${resource}' not found${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

/**
 * Notion's error envelope shape. Always
 * `{ object: "error", status, code, message, request_id? }`.
 * See https://developers.notion.com/reference/status-codes.
 */
export interface NotionErrorPayload {
  object?: "error";
  status?: number;
  code?: string;
  message?: string;
  request_id?: string;
}

/**
 * Helper used by every Notion wrapper to extract a human-readable error
 * message from a Notion 4xx/5xx response body. Falls back to
 * `HTTP <status>` when the body isn't valid JSON or doesn't have the
 * Notion error envelope.
 */
export function surfaceNotionError(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as NotionErrorPayload;
    if (parsed?.message) detail = parsed.message;
    else if (parsed?.code) detail = parsed.code;
  } catch {
    // not JSON — leave the HTTP-status fallback in place.
  }
  return detail;
}
