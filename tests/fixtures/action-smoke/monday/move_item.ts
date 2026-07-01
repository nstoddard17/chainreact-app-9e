import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:move_item (destructiveSafe) — Monday item lifecycle batch.
 *
 *   setup    create_item -> create a smoke item in the discovered SOURCE group
 *            (SMOKE_MONDAY_GROUP_ID). Capture { itemId } into ledger key "item".
 *   execute  move_item   -> move the item into a distinct DESTINATION group
 *            (SMOKE_MONDAY_TARGET_GROUP_ID, a second group auto-discovered on the
 *            board).
 *   verify   get_item    -> INDEPENDENT read-back: markerPath "itemName" confirms it
 *            is our smoke item AND expectEquals { groupId == target } proves the move
 *            landed on the persisted item (not the move echo).
 *   cleanup  delete_item -> delete exactly the ledger item (registered destructive
 *            action; smoke-owned). 0 leaked.
 *
 * BLOCKED_ENV when the board has only one group: SMOKE_MONDAY_TARGET_GROUP_ID is
 * unset, so the orchestrator's target gate blocks (creating a second group is out of
 * scope for this slice). Board/group discovery + DB-derived connection reuse the
 * create_item foundation.
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "move_item",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
    itemId: "{{ledger.item.id}}",
    targetGroupId: "{{env.SMOKE_MONDAY_TARGET_GROUP_ID}}",
  },
  requiredEnv: [
    "SMOKE_MONDAY_BOARD_ID",
    "SMOKE_MONDAY_GROUP_ID",
    "SMOKE_MONDAY_TARGET_GROUP_ID",
  ],
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
      // Our marked item now lives in the destination group.
      markerPath: "itemName",
      expectEquals: { path: "groupId", value: "{{env.SMOKE_MONDAY_TARGET_GROUP_ID}}" },
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
    "Create smoke item in source group -> move_item to a second discovered group -> " +
    "get_item read-back (marker + groupId == target) -> delete_item. destructiveSafe; " +
    "BLOCKED_ENV when the board has only one group (no group creation in scope).",
});
