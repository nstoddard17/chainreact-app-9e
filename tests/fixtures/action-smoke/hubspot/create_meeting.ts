import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:create_meeting (writeSafe) — HubSpot engagement finisher batch.
 *
 *   execute  create_meeting -> capture { meetingId } into ledger key "meeting".
 *            The meeting TITLE carries the unique smoke marker. Outcome rides
 *            the schema default ("SCHEDULED"); start/end times are omitted
 *            (optional per schema — the record is a CRM engagement entry, not
 *            a calendar invite; no attendees exist so nobody is invited or
 *            notified). `hs_timestamp` is omitted -> handler defaults to now().
 *   verify   meeting_state (smokeRead) -> INDEPENDENT GET-by-id read-back via
 *            the smoke-only seam (`GET /crm/v3/objects/meetings/{id}`);
 *            markerPath proves the marker on the PERSISTED hs_meeting_title.
 *   cleanup  none — HubSpot has NO registered delete/archive action for
 *            meetings (artifact "left" on the throwaway portal).
 *
 * Connection is DB-probed by the dev test; meeting fixtures need no target env.
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "create_meeting",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    hs_meeting_title: "{{smokeMarker}}meeting",
    hs_meeting_body: "ChainReact action-smoke artifact - safe to ignore",
  },
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "meeting", idPath: "meetingId", kind: "meeting" },
    // create_meeting echoes the stored title; confirm the unique marker round-tripped.
    markerEchoPath: "title",
    verify: {
      provider: "hubspot",
      action: "meeting_state",
      smokeRead: true,
      config: { meetingId: "{{ledger.meeting.id}}" },
      markerPath: "title",
    },
  },
  notes:
    "Create a smoke-marked meeting engagement record (no attendees, no invites, " +
    "schema-default SCHEDULED outcome) -> meeting_state seam GET-by-id read-back " +
    "(marker on hs_meeting_title). No registered meeting delete/archive action -> " +
    "artifact left on the throwaway portal.",
});
