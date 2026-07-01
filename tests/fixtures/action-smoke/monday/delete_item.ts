import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:delete_item (destructiveSafe, executeIsCleanup) — Monday item-tree reuse batch.
 *
 * The action under test IS the disposition:
 *   setup    create_item -> create a smoke item ("{{marker}}item") on the
 *            auto-discovered board/group. Capture { itemId } into ledger key "item".
 *   execute  delete_item -> delete exactly the ledger item. executeIsCleanup: the
 *            successful delete marks the ledger item cleaned (no separate cleanup) ->
 *            0 leaked.
 *   verify   list_items  -> INDEPENDENT read-back of the board's items; expectAbsent
 *            proves the deleted item's marker is GONE from the active-items list
 *            (Monday excludes deleted items from item queries). The delete handler's
 *            own success echo is never trusted.
 *
 * Monday delete is a UI-recoverable soft delete (recycle bin), but the item is gone
 * from the board's active items -> artifact "cleaned".
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "delete_item",
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
    itemId: "{{ledger.item.id}}",
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
    // The execute action removes the ledger item -> no separate cleanup step.
    executeIsCleanup: true,
    verify: {
      provider: "monday",
      action: "list_items",
      config: {
        boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
      },
      // The deleted item's marker must no longer appear in the active items list.
      expectAbsent: { path: "items", value: "{{smokeMarker}}" },
    },
  },
  notes:
    "Create smoke item -> delete_item removes it (executeIsCleanup) -> list_items " +
    "read-back proves the marker is absent from active items. destructiveSafe; " +
    "soft delete (recycle-bin recoverable), item gone from the board. 0 leaked.",
});
