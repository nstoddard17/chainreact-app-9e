/**
 * Sheets-specific typed errors thrown by API wrappers.
 *
 * `Unauthorized401Error` (for the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — wrappers import that one directly.
 * This file holds Sheets-shape-specific errors that handlers (not the
 * refresh wrapper) catch.
 */

/**
 * Thrown by `spreadsheetsGet` / `valuesGet` / `valuesUpdate` /
 * `valuesAppend` / `valuesClear` on HTTP 404 — the spreadsheet id doesn't
 * exist (or the user lacks access, which Google represents as 404 to
 * avoid leaking existence). Also thrown by these on HTTP 400 with
 * `error.status === "INVALID_ARGUMENT"` and a message that names the
 * sheet/range — Sheets returns 400 (not 404) when the SHEET name inside
 * a known spreadsheet is missing. We surface both as NotFoundError so
 * handlers can give the user the same "we couldn't find that resource"
 * UX regardless of which Google sub-error fired.
 */
export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Google Sheets resource '${resource}' not found${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
  }
}
