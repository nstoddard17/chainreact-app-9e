import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — microsoft-outlook-calendar:create_event (destructiveSafe, cleaned — hard delete).
 *
 *   execute  create_event  -> create a marker-subject timed event on the user's
 *            DEFAULT calendar. NO attendees + responseRequested:false, so the action
 *            sends ZERO invitations (nothing leaves the account). Capture { id }.
 *   verify   events_get (SMOKE READ-BACK) -> GET the event by id and confirm the
 *            marker on the PERSISTED `subject`. create_event's output `subject` falls
 *            back to config (input echo), so the read-back is independent.
 *   cleanup  delete_event -> remove exactly the ledger event.
 *
 * Mirrors the certified google-calendar:create_event. Self-contained on the user's
 * own default calendar (no target discovery); fixed far-future times keep it
 * deterministic (verification is by id, not a time window). requiredEnv is only the
 * connection signal. Graph delete_event is a TRUE erase -> LIVE_PASS_CLEANED.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-outlook-calendar",
  action: "create_event",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    subject: "{{smokeMarker}}event",
    // Flat builder field names (startDateTime/endDateTime) — these are the meta's
    // REQUIRED fields the engine readiness gate checks; the schema preprocess
    // normalizes them to the nested {start,end} shape for the handler.
    startDateTime: "2030-01-01T10:00:00",
    startTimeZone: "UTC",
    endDateTime: "2030-01-01T11:00:00",
    endTimeZone: "UTC",
    isAllDay: false,
    // No attendees -> no invites. responseRequested explicit (Q11).
    responseRequested: false,
  },
  requiredEnv: ["SMOKE_MICROSOFT_OUTLOOK_CALENDAR_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "event", idPath: "id", kind: "event" },
    // Independent read-back: events.get returns the persisted subject.
    verify: {
      provider: "microsoft-outlook-calendar",
      action: "events_get",
      config: { eventId: "{{ledger.event.id}}" },
      markerPath: "subject",
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
    "PILOT — create timed event (marker subject, NO attendees, no-RSVP) on default " +
    "calendar -> events.get read-back marker on subject -> delete_event (hard erase). " +
    "No invites sent. destructiveSafe.",
});
