import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — google-calendar:update_event (destructiveSafe, cleaned — hard delete).
 *
 *   setup    create_event -> capture { eventId } (summary "{{smokeMarker}}event",
 *            no attendees, no-notify) on PRIMARY
 *   execute  update_event -> patch the summary to "{{smokeMarker}}updated"
 *            (sendNotifications:"none" — no attendees -> nothing sent)
 *   verify   events_get (SMOKE READ-BACK) -> GET by id; require the marker WITH the
 *            "updated" suffix on the persisted `summary`. The seed summary
 *            ("...event") lacks the suffix, so a no-op update FAILS — the read-back
 *            proves the patch actually landed, not the update echo.
 *   cleanup  delete_event -> remove exactly the ledger event.
 *
 * Self-contained on the primary calendar; verification by id. requiredEnv is only
 * the connection signal. Hard delete -> LIVE_PASS_CLEANED.
 */
export default defineWriteSmokeFixture({
  provider: "google-calendar",
  action: "update_event",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    calendarId: "primary",
    eventId: "{{ledger.event.id}}",
    summary: "{{smokeMarker}}updated",
    sendNotifications: "none",
  },
  requiredEnv: ["SMOKE_GOOGLE_CALENDAR_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "google-calendar",
        action: "create_event",
        config: {
          calendarId: "primary",
          summary: "{{smokeMarker}}event",
          allDay: false,
          startDateTime: "2030-01-01T10:00:00Z",
          endDateTime: "2030-01-01T11:00:00Z",
          timezone: "UTC",
          sendNotifications: "none",
          guestsCanInviteOthers: false,
          guestsCanSeeOtherGuests: false,
        },
        captureResource: { resourceKey: "event", idPath: "eventId", kind: "event" },
      },
    ],
    // Independent read-back: marker + "updated" suffix on the persisted summary.
    verify: {
      provider: "google-calendar",
      action: "events_get",
      config: { eventId: "{{ledger.event.id}}", calendarId: "primary" },
      markerPath: "summary",
      markerSuffix: "updated",
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
    "PILOT — create event -> update summary to marker+updated -> events.get read-back " +
    "marker+updated on summary -> delete_event (hard erase). Proves the patch landed. destructiveSafe.",
});
