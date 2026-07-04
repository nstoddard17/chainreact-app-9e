import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:add_column (writeSafe) — add a column to a smoke-owned board.
 *
 *   setup    create_board -> deterministic crsmoke- board (capture ledger key
 *            "board") so the column never lands on a real board's schema.
 *   execute  add_column   -> marker-titled TEXT column on {{ledger.board.id}};
 *            capture { columnId } into ledger key "column". markerEchoPath
 *            proves the marker round-tripped on the stored column title.
 *   verify   get_board    -> INDEPENDENT read-back keyed on
 *            {{ledger.board.id}}; markerPath "columns" confirms the marker
 *            column title on the PERSISTED board schema (never the create echo).
 *
 * DISPOSITION: none. Monday exposes neither a column delete nor a board delete
 * as a registered V2 action, so the marked board (carrying the marked column)
 * stays as a clearly-marked artifact on the throwaway workspace.
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "add_column",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    boardId: "{{ledger.board.id}}",
    columnTitle: "{{smokeMarker}}col",
    columnType: "text",
  },
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "monday",
        action: "create_board",
        config: {
          boardName: "{{smokeMarker}}colboard",
          boardKind: "public",
          description: "{{smokeMarker}}smoke column host (safe to delete)",
        },
        captureResource: { resourceKey: "board", idPath: "boardId", kind: "board" },
      },
    ],
    captureResource: { resourceKey: "column", idPath: "columnId", kind: "column" },
    markerEchoPath: "columnTitle",
    verify: {
      provider: "monday",
      action: "get_board",
      config: { boardId: "{{ledger.board.id}}" },
      markerPath: "columns",
    },
    // No cleanup: no registered column/board delete -> marked board artifact left.
  },
  notes:
    "create_board (smoke host) -> add_column (text, marker title) -> get_board " +
    "read-back proves the marker on the persisted columns[]. writeSafe; marked " +
    "board artifact left (no registered column/board delete).",
});
