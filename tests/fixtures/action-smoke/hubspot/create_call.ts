import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:create_call (writeSafe) — HubSpot engagement finisher batch.
 *
 *   execute  create_call -> capture { callId } into ledger key "call". The call
 *            TITLE carries the unique smoke marker. Logged as a COMPLETED call
 *            (the schema default) with no duration/direction/owner/
 *            associations — a standalone "logged call" placeholder that pings
 *            nobody and never dials anything (HubSpot calls are records, not
 *            telephony). `hs_timestamp` is omitted -> handler defaults to now()
 *            (same documented fall-through as create_note).
 *   verify   call_state (smokeRead) -> INDEPENDENT GET-by-id read-back via the
 *            smoke-only seam (`GET /crm/v3/objects/calls/{id}`); markerPath
 *            proves the marker on the PERSISTED hs_call_title.
 *   cleanup  none — HubSpot has NO registered delete/archive action for calls
 *            (artifact "left" on the throwaway portal).
 *
 * Connection is DB-probed by the dev test; call fixtures need no target env.
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "create_call",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    hs_call_title: "{{smokeMarker}}call",
    hs_call_body: "ChainReact action-smoke artifact - safe to ignore",
  },
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "call", idPath: "callId", kind: "call" },
    // create_call echoes the stored title; confirm the unique marker round-tripped.
    markerEchoPath: "title",
    verify: {
      provider: "hubspot",
      action: "call_state",
      smokeRead: true,
      config: { callId: "{{ledger.call.id}}" },
      markerPath: "title",
    },
  },
  notes:
    "Log a smoke-marked COMPLETED call record (no telephony, no owner, no " +
    "associations) -> call_state seam GET-by-id read-back (marker on hs_call_title). " +
    "No registered call delete/archive action -> artifact left on the throwaway portal.",
});
