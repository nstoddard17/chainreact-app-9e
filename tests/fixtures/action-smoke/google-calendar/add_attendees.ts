import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-calendar:add_attendees (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-45.
 *
 * Chains off the certified create_event / delete_event pilots: the run CREATES a
 * smoke-owned event, adds an attendee to THAT event, verifies it independently, then
 * hard-deletes the whole event. `add_attendees` is NOT a send — `sendNotifications:"none"`
 * means Google delivers ZERO invitation emails, and the attendee is a reserved
 * non-deliverable `.invalid` address as defense in depth. No user/customer event is ever
 * touched — only the event this run created.
 *
 *   setup    create_event  -> create a marker-titled timed event on PRIMARY at a FIXED
 *            far-future time (2030-01-01), NO attendees, no-notify. Capture { eventId }
 *            into ledger key "event".
 *   execute  add_attendees -> add the marker attendee "{{marker}}attendee@example.invalid"
 *            to the event, `sendNotifications:"none"` (no invite leaves the account). The
 *            handler's merged-attendees echo is never trusted.
 *   verify   list_events (certified) -> INDEPENDENT read of the FIXED 2030 time window
 *            (immediate consistency, no search-index lag); confirm the unique marker
 *            attendee email is present among the events' raw `attendees` (markerPath
 *            "events" + markerSuffix "attendee@example.invalid"). A no-op add leaves the
 *            event without that attendee, so the check fails.
 *   cleanup  delete_event (no-notify) -> hard-erase exactly the ledger event (events.delete
 *            is a TRUE erase), which removes the attendee with it. Same provider — NOT
 *            cross-provider.
 *
 * Verified-by-read-back, smoke-owned throughout, zero leaked, zero invites. requiredEnv is
 * only the connection signal (the event lands on the user's own primary calendar).
 *
 * NOT live-certified yet — live workflow-run smokes are blocked by an unrelated durable-queue
 * enum WIP (`workflow_runs.status = "queued"` not yet in the DB enum). NOT_RUN_READY: authored
 * + offline-validated; cert deferred until the engine unblocks.
 */
export default defineWriteSmokeFixture({
  provider: "google-calendar",
  action: "add_attendees",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    calendarId: "primary",
    eventId: "{{ledger.event.id}}",
    // Reserved, never-deliverable TLD; combined with sendNotifications "none" -> no email.
    attendees: ["{{smokeMarker}}attendee@example.invalid"],
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
    // Independent read-back: list_events over the FIXED 2030 window exposes raw event
    // `attendees`; confirm the unique marker attendee email is present.
    verify: {
      provider: "google-calendar",
      action: "list_events",
      config: {
        calendarId: "primary",
        timeMin: "2030-01-01T00:00:00Z",
        timeMax: "2030-01-02T00:00:00Z",
        singleEvents: true,
      },
      markerPath: "events",
      markerSuffix: "attendee@example.invalid",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "google-calendar",
      action: "delete_event",
      config: { calendarId: "primary", eventId: "{{ledger.event.id}}", sendNotifications: "none" },
    },
  },
  notes:
    "SMOKE-WRITE-45 — create smoke event (fixed 2030, no attendees, no-notify) -> add_attendees " +
    "'{{marker}}attendee@example.invalid' (sendNotifications none -> no invite) -> independent " +
    "list_events over the 2030 window confirms the marker attendee email among events.attendees " +
    "-> delete_event hard-erases the event. destructiveSafe, no invites sent. NOT live-certified " +
    "yet (durable-queue enum blocker).",
});
