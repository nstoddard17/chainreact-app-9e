import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — google-calendar:create_event (destructiveSafe, cleaned — hard delete).
 *
 *   execute  create_event -> create a marker-titled timed event on the PRIMARY
 *            calendar. NO attendees + sendNotifications:"none" + no Google Meet, so
 *            the action sends ZERO notifications/invites (nothing leaves the
 *            account). Capture { eventId } into ledger key "event".
 *   verify   events_get (SMOKE READ-BACK) -> GET the event by id and confirm the
 *            marker on the PERSISTED `summary`. create_event's output `summary`
 *            falls back to config (input echo), so the read-back is independent.
 *   cleanup  delete_event (sendNotifications:"none") -> remove exactly the ledger event.
 *
 * Self-contained on the user's own primary calendar (no target discovery). Fixed
 * far-future times keep the fixture deterministic; verification is by id, not by a
 * time window. requiredEnv is only the connection signal.
 *
 * Calendar delete is a TRUE erase (events.delete) — the event is gone, not trashed
 * -> LIVE_PASS_CLEANED.
 */
export default defineWriteSmokeFixture({
  provider: "google-calendar",
  action: "create_event",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    calendarId: "primary",
    summary: "{{smokeMarker}}event",
    allDay: false,
    startDateTime: "2030-01-01T10:00:00Z",
    endDateTime: "2030-01-01T11:00:00Z",
    timezone: "UTC",
    // No attendees -> no invites. Explicit no-notify choice (Q11 requires it).
    sendNotifications: "none",
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
  },
  requiredEnv: ["SMOKE_GOOGLE_CALENDAR_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "event", idPath: "eventId", kind: "event" },
    // Independent read-back: events.get returns the persisted summary.
    verify: {
      provider: "google-calendar",
      action: "events_get",
      config: { eventId: "{{ledger.event.id}}", calendarId: "primary" },
      markerPath: "summary",
      smokeRead: true,
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "google-calendar",
      action: "delete_event",
      config: { eventId: "{{ledger.event.id}}", calendarId: "primary", sendNotifications: "none" },
    },
  },
  notes:
    "PILOT — create timed event (marker summary, NO attendees, no-notify) on primary -> " +
    "events.get read-back marker on summary -> delete_event (hard erase). No invites sent. destructiveSafe.",
});
