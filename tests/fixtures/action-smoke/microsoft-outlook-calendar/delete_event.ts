import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — microsoft-outlook-calendar:delete_event (destructiveSafe, cleaned — hard delete).
 *
 *   setup    create_event -> capture { id } (marker-subject event, no attendees) on
 *            the DEFAULT calendar
 *   execute  delete_event -> delete exactly the ledger event. The execute IS the
 *            disposition (executeIsCleanup); Graph delete is a true erase.
 *   verify   events_get (SMOKE READ-BACK) -> assert the event is ABSENT
 *            (`exists == false`). A deleted Outlook event returns Graph 404 -> typed
 *            NotFoundError mapped to exists:false; any other error propagates ->
 *            VERIFY_FAILED. The handler's own deleted/alreadyMissing echo is NOT trusted.
 *
 * Mirrors the certified google-calendar:delete_event. requiredEnv is only the
 * connection signal. No separate cleanup — the delete under test is the cleanup.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-outlook-calendar",
  action: "delete_event",
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    eventId: "{{ledger.event.id}}",
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
    // The delete under test removes the smoke event -> it IS the disposition.
    executeIsCleanup: true,
    // Independent absence read-back (smoke-only events.get existence probe).
    verify: {
      provider: "microsoft-outlook-calendar",
      action: "events_get",
      config: { eventId: "{{ledger.event.id}}" },
      expectEquals: { path: "exists", value: false },
      smokeRead: true,
    },
  },
  notes:
    "PILOT — create event -> delete_event (hard erase) -> independent events.get " +
    "exists==false (typed 404 NotFoundError). destructiveSafe.",
});
