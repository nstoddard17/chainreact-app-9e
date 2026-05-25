/**
 * Trello API typed errors thrown by HTTP wrappers — shared across the
 * Trello provider.
 *
 * `Unauthorized401Error` (for the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — wrappers import that one
 * directly. This file holds Trello-shape-specific errors that handlers
 * catch.
 *
 * Mirrors Notion / GitHub `_shared/<vendor>/api/errors.ts` shape so
 * cross-provider error handling stays consistent.
 */

/**
 * Thrown by Trello resource-getters on HTTP 404 — the resource doesn't
 * exist or the user lacks access. Trello uses 404 to avoid leaking
 * existence; both cases surface as `NotFoundError` so handlers can give
 * the same "we couldn't find that" UX regardless of which sub-cause
 * fired.
 */
export class TrelloNotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Trello resource '${resource}' not found${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "TrelloNotFoundError";
    this.resource = resource;
  }
}

/**
 * Extracts a human-readable error message from a Trello 4xx/5xx
 * response body. Trello returns plain-text error bodies (e.g.
 * `"invalid id"`, `"invalid value for field 'name'"`) rather than a
 * JSON envelope. Falls back to `HTTP <status>` when the body is empty.
 *
 * **Security:** the caller is responsible for ensuring the input text
 * does NOT contain user tokens. This helper does no scrubbing — it
 * trusts the caller to pass only response bodies (which never echo the
 * request URL or auth params).
 */
export function surfaceTrelloError(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) return `HTTP ${status}`;
  // Trello sometimes returns JSON for validation errors with a `message`
  // field. Try JSON first; fall back to plain-text body otherwise.
  try {
    const parsed = JSON.parse(trimmed) as { message?: string; error?: string };
    if (typeof parsed.message === "string" && parsed.message.length > 0) {
      return parsed.message;
    }
    if (typeof parsed.error === "string" && parsed.error.length > 0) {
      return parsed.error;
    }
  } catch {
    // Not JSON — plain text.
  }
  // Cap the surfaced message to a reasonable length to avoid log spam.
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}
