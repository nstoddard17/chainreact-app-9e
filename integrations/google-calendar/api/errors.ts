/**
 * Calendar-specific typed errors thrown by API wrappers.
 *
 * `Unauthorized401Error` (for the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — wrappers import that one directly.
 * This file holds Calendar-shape-specific errors that handlers (not the
 * refresh wrapper) catch.
 */

/**
 * Thrown by `eventsGet` / `eventsDelete` / `eventsPatch` / `eventsUpdate`
 * on HTTP 404 — the calendar or event id doesn't exist (or the user lacks
 * access, which Google represents as 404 to avoid leaking existence).
 *
 * Caught by `deleteEvent` to translate into `{ alreadyDeleted: true }` and
 * by `addAttendees` to fail explicitly when the event is missing.
 */
export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Google Calendar resource '${resource}' not found${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

/**
 * Thrown by `eventsList` when a passed `syncToken` has expired (HTTP 410
 * Gone). Calendar's sync tokens are durable for a few weeks but expire
 * eventually; the watch trigger's `pull` catches this and re-baselines
 * via a fresh full list.
 */
export class SyncTokenExpiredError extends Error {
  constructor() {
    super(
      "Google Calendar syncToken expired (HTTP 410 Gone). Re-baseline required.",
    );
    this.name = "SyncTokenExpiredError";
  }
}
