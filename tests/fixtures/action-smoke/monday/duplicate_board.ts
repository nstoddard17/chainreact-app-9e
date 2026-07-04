import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:duplicate_board (writeSafe) — clone a smoke-owned source board.
 *
 *   setup    create_board    -> deterministic crsmoke- SOURCE board (capture
 *            ledger key "board") so the duplicate never touches a real board.
 *   execute  duplicate_board -> structure-only clone (the least-data-copying
 *            duplicateType) with an explicit marker newBoardName; capture
 *            { newBoardId } into ledger key "dup". markerEchoPath proves the
 *            marker on the name Monday returned for the NEW board.
 *   verify   get_board       -> INDEPENDENT read-back keyed on
 *            {{ledger.dup.id}}; markerPath confirms the marker on the
 *            persisted duplicate's boardName.
 *
 * DISPOSITION: none. No registered Monday board delete action exists, so BOTH
 * marked boards (source + duplicate) stay as clearly-marked artifacts on the
 * throwaway workspace. Each run leaves two marked boards.
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "duplicate_board",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    boardId: "{{ledger.board.id}}",
    duplicateType: "duplicate_board_with_structure",
    newBoardName: "{{smokeMarker}}dup",
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
          boardName: "{{smokeMarker}}dupsrc",
          boardKind: "public",
          description: "{{smokeMarker}}smoke duplicate source (safe to delete)",
        },
        captureResource: { resourceKey: "board", idPath: "boardId", kind: "board" },
      },
    ],
    captureResource: { resourceKey: "dup", idPath: "newBoardId", kind: "board" },
    markerEchoPath: "newBoardName",
    verify: {
      provider: "monday",
      action: "get_board",
      config: { boardId: "{{ledger.dup.id}}" },
      markerPath: "boardName",
    },
    // No cleanup: no registered Monday board delete -> source + duplicate left.
  },
  notes:
    "create_board (smoke source) -> duplicate_board (structure only, marker " +
    "newBoardName) -> get_board read-back on the NEW board proves the marker. " +
    "writeSafe; two marked board artifacts left (no registered board delete).",
});
