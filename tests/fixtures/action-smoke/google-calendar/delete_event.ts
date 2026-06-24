import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — google-calendar:delete_event (destructiveSafe, cleaned — hard delete).
 *
 *   setup    create_event -> capture { eventId } (marker summary, no attendees,
 *            no-notify) on PRIMARY
 *   execute  delete_event (sendNotifications:"none") -> delete exactly the ledger
 *            event. The execute IS the disposition (executeIsCleanup); calendar
 *            delete is a true erase, so there is nothing left to chase.
 *   verify   events_get (SMOKE READ-BACK) -> assert the event is ABSENT
 *            (`exists == false`). A deleted single event surfaces as a typed 404
 *            NotFoundError OR a 200 with status "cancelled" — the reader maps BOTH
 *            to exists:false; any other error propagates -> VERIFY_FAILED (never a
 *            false "deleted"). The handler's own `deleted`/`alreadyDeleted` echo is
 *            NOT trusted.
 *
 * Operates ONLY on an event THIS run created. requiredEnv is only the connection
 * signal. No separate cleanup step — the delete under test is the cleanup.
 */
export default defineWriteSmokeFixture({
  provider: "google-calendar",
  action: "delete_event",
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    calendarId: "primary",
    eventId: "{{ledger.event.id}}",
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
    // The delete under test removes the smoke event -> it IS the disposition.
    executeIsCleanup: true,
    // Independent absence read-back (smoke-only events.get existence probe).
    verify: {
      provider: "google-calendar",
      action: "events_get",
      config: { eventId: "{{ledger.event.id}}", calendarId: "primary" },
      expectEquals: { path: "exists", value: false },
      smokeRead: true,
    },
  },
  notes:
    "PILOT — create event -> delete_event (hard erase) -> independent events.get " +
    "exists==false (typed 404 OR status=cancelled, both = gone). destructiveSafe.",
});
