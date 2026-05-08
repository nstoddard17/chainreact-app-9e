/**
 * Drive-specific typed errors thrown by API wrappers.
 *
 * `Unauthorized401Error` (for the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — wrappers import that one directly.
 * This file holds Drive-shape-specific errors that handlers (not the
 * refresh wrapper) catch.
 */

/**
 * Thrown by `filesGet` / `filesUpdate` / `filesDelete` on HTTP 404 — the
 * file id doesn't exist (or the user lacks access, which Google represents
 * as 404 to avoid leaking existence). Used by `deleteFile` to translate
 * into `{ alreadyDeleted: true }` and by `moveFile` to fail with a clear
 * "file not found" path.
 */
export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Google Drive resource '${resource}' not found${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

/**
 * Thrown by `changesList` when the page token has expired (HTTP 410 Gone).
 * Drive rotates page tokens after ~30 days; the watch trigger's `pull`
 * catches this and re-baselines via `changesGetStartPageToken`.
 *
 * Defined here in Commit 3 alongside other Drive errors; consumed in
 * Commit 4 by `triggers/fileChanged/pull.ts`.
 */
export class PageTokenExpiredError extends Error {
  constructor() {
    super(
      "Google Drive pageToken expired (HTTP 410 Gone). Re-baseline required.",
    );
    this.name = "PageTokenExpiredError";
  }
}
