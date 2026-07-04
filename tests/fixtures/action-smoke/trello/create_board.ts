import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * trello:create_board (writeSafe, artifact left) — create a deterministic
 * crsmoke- PRIVATE board, then prove it persisted via an INDEPENDENT
 * member-boards read.
 *
 *   execute  create_board -> POST /1/boards with a marker name, EXPLICIT
 *            visibility "private" (Q11 — the least-exposed choice; never
 *            workspace/public), defaultLists false (no To Do/Doing/Done
 *            clutter). Capture { boardId } into ledger key "board".
 *            markerEchoPath proves the marker on Trello's stored name.
 *   verify   member_boards (SMOKE READ-BACK) -> GET /1/members/me/boards
 *            (id/name/closed fields only); markerPath "boards" confirms the
 *            marker board name on the PERSISTED board list (never the create
 *            echo).
 *
 * DISPOSITION: none. V2 registers no board close/delete action (archive_card is
 * cards-only), so the empty marked private board stays on the throwaway Trello
 * account (monday:create_board precedent). Each run leaves one marked board.
 */
export default defineWriteSmokeFixture({
  provider: "trello",
  action: "create_board",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    name: "{{smokeMarker}}board",
    visibility: "private",
    defaultLists: false,
  },
  requiredEnv: ["SMOKE_TRELLO_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "board", idPath: "boardId", kind: "board" },
    markerEchoPath: "name",
    verify: {
      provider: "trello",
      action: "member_boards",
      config: {},
      smokeRead: true,
      markerPath: "boards",
    },
    // No cleanup: no registered Trello board close/delete -> marked artifact.
  },
  notes:
    "create_board (marker name, explicit private visibility, no default lists) -> " +
    "member_boards read-back proves the marker on the persisted board list. " +
    "writeSafe; marked private board artifact left (no registered board delete).",
});
