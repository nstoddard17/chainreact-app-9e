import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:create_note (writeSafe) — HubSpot engagement batch.
 *
 *   execute  create_note -> capture { noteId } into ledger key "note". The note
 *            BODY carries the unique smoke marker. No associations are set (all
 *            optional) — the note is a standalone engagement, so the fixture
 *            needs no contact/company/deal setup.
 *   verify   note_state (smokeRead) -> INDEPENDENT GET-by-id read-back via the
 *            smoke-only seam (`GET /crm/v3/objects/notes/{id}`); markerPath
 *            proves the marker on the PERSISTED hs_note_body.
 *   cleanup  none — HubSpot has NO registered delete/archive action for notes
 *            (artifact "left" on the throwaway portal).
 *
 * Connection is DB-probed by the dev test; note fixtures need no target env.
 * `hs_timestamp` is omitted -> handler defaults to now() (documented schema
 * behavior, not a high-risk default).
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "create_note",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    hs_note_body: "{{smokeMarker}}note ChainReact action-smoke - safe to ignore",
  },
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "note", idPath: "noteId", kind: "note" },
    // create_note echoes the stored body; confirm the unique marker round-tripped.
    markerEchoPath: "body",
    verify: {
      provider: "hubspot",
      action: "note_state",
      smokeRead: true,
      config: { noteId: "{{ledger.note.id}}" },
      markerPath: "body",
    },
  },
  notes:
    "Create a smoke-marked standalone note (no associations) -> note_state seam " +
    "GET-by-id read-back (marker on hs_note_body). No registered note delete/archive " +
    "action -> artifact left on the throwaway portal.",
});
