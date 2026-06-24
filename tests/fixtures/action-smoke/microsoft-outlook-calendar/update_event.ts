import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — microsoft-outlook-calendar:update_event (destructiveSafe, cleaned — hard delete).
 *
 *   setup    create_event -> capture { id } (marker-subject event, no attendees) on
 *            the DEFAULT calendar
 *   execute  update_event -> patch the subject to "{{smokeMarker}}updated"
 *   verify   events_get (SMOKE READ-BACK) -> GET by id; require the marker WITH the
 *            "updated" suffix on the persisted `subject`. The seed subject
 *            ("...event") lacks the suffix, so a no-op update FAILS — the read-back
 *            proves the patch landed, not the update echo.
 *   cleanup  delete_event -> remove exactly the ledger event.
 *
 * Mirrors the certified google-calendar:update_event. requiredEnv is only the
 * connection signal. Hard delete -> LIVE_PASS_CLEANED.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-outlook-calendar",
  action: "update_event",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    eventId: "{{ledger.event.id}}",
    subject: "{{smokeMarker}}updated",
  },
  requiredEnv: ["SMOKE_MICROSOFT_OUTLOOK_CALENDAR_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "microsoft-outlook-calendar",
        action: "create_event",
        config: {
          subject: "{{smokeMarker}}event",
          startDateTime: "2030-01-01T10:00:00",
          startTimeZone: "UTC",
          endDateTime: "2030-01-01T11:00:00",
          endTimeZone: "UTC",
          isAllDay: false,
          responseRequested: false,
        },
        captureResource: { resourceKey: "event", idPath: "id", kind: "event" },
      },
    ],
    // Independent read-back: marker + "updated" suffix on the persisted subject.
    verify: {
      provider: "microsoft-outlook-calendar",
      action: "events_get",
      config: { eventId: "{{ledger.event.id}}" },
      markerPath: "subject",
      markerSuffix: "updated",
      smokeRead: true,
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-outlook-calendar",
      action: "delete_event",
      config: { eventId: "{{ledger.event.id}}" },
    },
  },
  notes:
    "PILOT — create event -> update subject to marker+updated -> events.get read-back " +
    "marker+updated on subject -> delete_event (hard erase). Proves the patch landed. destructiveSafe.",
});
