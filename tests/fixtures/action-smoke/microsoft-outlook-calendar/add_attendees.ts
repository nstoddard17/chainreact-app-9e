import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-outlook-calendar:add_attendees (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-46.
 *
 * Mirrors the SMOKE-WRITE-45 Google Calendar pattern: the run CREATES a smoke-owned event,
 * adds an attendee to THAT event, verifies it independently, then hard-deletes the whole
 * event. No user/customer event is ever touched — only the event this run created.
 *
 * NO-NOTIFY note: unlike Google Calendar's `add_attendees`, the Outlook action has NO
 * notification toggle — it PATCHes `/me/events/{id}` with the merged attendee list. So the
 * sole safeguard against an invite is the attendee address: a reserved, RFC-6761
 * non-deliverable `.invalid` address. Any invite Exchange might attempt cannot resolve and
 * bounces at the sending server — NO real party is ever contacted (no broadcast). This is
 * exactly the defense-in-depth the smoke charter mandates when an action has no no-notify.
 *
 *   setup    create_event  -> create a marker-subjected timed event on the default calendar
 *            at a FIXED far-future time (2030-01-01), NO attendees, responseRequested:false.
 *            Capture { id } into ledger key "event".
 *   execute  add_attendees -> add the marker attendee "{{marker}}attendee@example.invalid"
 *            (attendeeType "required"). The handler's merged-attendees echo is never trusted.
 *   verify   list_events (certified) -> INDEPENDENT read of the FIXED 2030 window; the
 *            certified list_events output projects per-event `attendees: [{address,...}]`,
 *            so markerPath "events" + markerSuffix "attendee@example.invalid" confirms the
 *            unique attendee email landed. A no-op add leaves the event without it → fails
 *            (the subject marker is "<marker>event", not the attendee suffix).
 *   cleanup  delete_event  -> hard-erase exactly the ledger event (Graph delete is a TRUE
 *            erase), which removes the attendee with it. Same provider.
 *
 * Verified-by-read-back, smoke-owned throughout, zero leaked, no real invite delivery.
 * requiredEnv is only the connection signal (the event lands on the user's default calendar).
 *
 * NOT live-certified yet — live workflow-run smokes are blocked by an unrelated durable-queue
 * enum WIP (`workflow_runs.status = "queued"` not yet in the DB enum). NOT_RUN_READY: authored
 * + offline-validated; cert deferred until the engine unblocks.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-outlook-calendar",
  action: "add_attendees",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    eventId: "{{ledger.event.id}}",
    // Reserved, never-deliverable TLD — the only safeguard (no no-notify option exists).
    attendees: ["{{smokeMarker}}attendee@example.invalid"],
    attendeeType: "required",
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
    // Independent read-back: certified list_events projects per-event attendees over the
    // FIXED 2030 window; confirm the unique marker attendee email is present.
    verify: {
      provider: "microsoft-outlook-calendar",
      action: "list_events",
      config: {
        startDateTime: "2030-01-01T00:00:00Z",
        endDateTime: "2030-01-02T00:00:00Z",
        top: 50,
      },
      markerPath: "events",
      markerSuffix: "attendee@example.invalid",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-outlook-calendar",
      action: "delete_event",
      config: { eventId: "{{ledger.event.id}}" },
    },
  },
  notes:
    "SMOKE-WRITE-46 — create smoke event (fixed 2030, no attendees) -> add_attendees " +
    "'{{marker}}attendee@example.invalid' (no no-notify option; .invalid = no real delivery) -> " +
    "independent certified list_events over the 2030 window confirms the marker attendee email " +
    "among events.attendees -> delete_event hard-erases the event. destructiveSafe, no real " +
    "invite. NOT live-certified yet (durable-queue enum blocker).",
});
