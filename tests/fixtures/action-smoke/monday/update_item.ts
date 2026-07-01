import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:update_item (destructiveSafe) — Monday item-tree reuse batch.
 *
 *   setup    create_item -> create a smoke item (name "{{marker}}item") on the
 *            auto-discovered board/group. Capture { itemId } into ledger key "item".
 *   execute  update_item -> change the item NAME to "{{marker}}updated" via the
 *            universal change_multiple_column_values path (columnId "name" — a
 *            board-schema-agnostic write; every Monday item has a name, so this
 *            never depends on a specific column existing on the discovered board).
 *   verify   get_item    -> INDEPENDENT read-back; markerPath "itemName" +
 *            markerSuffix "updated" requires "{{marker}}updated". The seed name is
 *            "{{marker}}item" (no "updated"), so a no-op update would fail — this
 *            proves the change landed on the persisted item.
 *   cleanup  delete_item -> delete exactly the ledger item (registered destructive
 *            action; smoke-owned). Monday delete is a recycle-bin soft delete.
 *
 * Connection + board/group discovery are inherited from the create_item foundation
 * (759afffbe): DB-derived connection, board/group auto-discovered on the throwaway
 * account, no SMOKE_MONDAY_CONNECTED. The board/group vars stay in requiredEnv only
 * so the orchestrator's target gate emits a clean BLOCKED_ENV when discovery finds
 * no safe board/group.
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "update_item",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
    itemId: "{{ledger.item.id}}",
    columnId: "name",
    columnValue: "{{smokeMarker}}updated",
  },
  requiredEnv: ["SMOKE_MONDAY_BOARD_ID", "SMOKE_MONDAY_GROUP_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "monday",
        action: "create_item",
        config: {
          boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
          groupId: "{{env.SMOKE_MONDAY_GROUP_ID}}",
          itemName: "{{smokeMarker}}item",
        },
        captureResource: { resourceKey: "item", idPath: "itemId", kind: "item" },
      },
    ],
    verify: {
      provider: "monday",
      action: "get_item",
      config: {
        boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
        itemId: "{{ledger.item.id}}",
      },
      // The renamed item's name shows up in the read-back; suffix proves the change.
      markerPath: "itemName",
      markerSuffix: "updated",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "monday",
      action: "delete_item",
      config: {
        boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
        itemId: "{{ledger.item.id}}",
      },
    },
  },
  notes:
    "Create smoke item -> update_item renames to {{marker}}updated (columnId 'name') " +
    "-> get_item read-back marker(+suffix updated) -> delete_item. destructiveSafe; " +
    "board/group auto-discovered on the throwaway account.",
});
