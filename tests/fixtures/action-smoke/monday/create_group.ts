import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:create_group (writeSafe) — add a group to a smoke-owned board.
 *
 *   setup    create_board -> deterministic crsmoke- board (capture ledger key
 *            "board") so the group never lands on a real board.
 *   execute  create_group -> marker-titled group on {{ledger.board.id}};
 *            capture { groupId } into ledger key "group". markerEchoPath
 *            proves the marker round-tripped on the stored group title.
 *   verify   list_groups  -> INDEPENDENT read-back of the board's groups;
 *            markerPath "groups" confirms the marker group title on the
 *            PERSISTED group list (never the create echo).
 *
 * DISPOSITION: none. Monday exposes neither a group delete nor a board delete
 * as a registered V2 action, so the marked board (containing the marked group)
 * stays as a clearly-marked artifact on the throwaway workspace.
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "create_group",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    boardId: "{{ledger.board.id}}",
    groupTitle: "{{smokeMarker}}group",
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
          boardName: "{{smokeMarker}}groupboard",
          boardKind: "public",
          description: "{{smokeMarker}}smoke group host (safe to delete)",
        },
        captureResource: { resourceKey: "board", idPath: "boardId", kind: "board" },
      },
    ],
    captureResource: { resourceKey: "group", idPath: "groupId", kind: "group" },
    markerEchoPath: "groupTitle",
    verify: {
      provider: "monday",
      action: "list_groups",
      config: { boardId: "{{ledger.board.id}}" },
      markerPath: "groups",
    },
    // No cleanup: no registered group/board delete -> marked board artifact left.
  },
  notes:
    "create_board (smoke host) -> create_group (marker title) -> list_groups " +
    "read-back proves the marker on the persisted group list. writeSafe; marked " +
    "board artifact left (no registered group/board delete).",
});
