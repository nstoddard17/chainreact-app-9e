import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * trello:create_list (writeSafe, artifact left) — add a list to a smoke-owned
 * board, then prove it persisted via an INDEPENDENT board-lists read.
 *
 *   setup    create_board -> a marker PRIVATE board with no default lists
 *            (capture ledger key "board") so the list never lands on a real
 *            board.
 *   execute  create_list -> marker-named list on {{ledger.board.id}}. Capture
 *            { listId } into ledger key "list". markerEchoPath proves the
 *            stored name.
 *   verify   board_lists (SMOKE READ-BACK) -> GET /1/boards/{id}/lists
 *            (id/name/closed only); markerPath "lists" confirms the marker list
 *            name on the PERSISTED board (never the create echo).
 *
 * DISPOSITION: none. No registered Trello board/list close/delete, so the
 * marked private board (containing the marked list) stays on the throwaway
 * account. Each run leaves one marked board + list.
 */
export default defineWriteSmokeFixture({
  provider: "trello",
  action: "create_list",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    idBoard: "{{ledger.board.id}}",
    name: "{{smokeMarker}}list",
  },
  requiredEnv: ["SMOKE_TRELLO_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "trello",
        action: "create_board",
        config: {
          name: "{{smokeMarker}}listhost",
          visibility: "private",
          defaultLists: false,
        },
        captureResource: { resourceKey: "board", idPath: "boardId", kind: "board" },
      },
    ],
    captureResource: { resourceKey: "list", idPath: "listId", kind: "list" },
    markerEchoPath: "name",
    verify: {
      provider: "trello",
      action: "board_lists",
      config: { boardId: "{{ledger.board.id}}" },
      smokeRead: true,
      markerPath: "lists",
    },
    // No cleanup: no registered board/list close/delete -> artifacts left.
  },
  notes:
    "create_board (smoke private host) -> create_list (marker name) -> board_lists " +
    "read-back proves the marker on the persisted list set. writeSafe; marked " +
    "board + list artifacts left (no registered board/list delete).",
});
