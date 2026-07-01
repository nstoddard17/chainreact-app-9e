import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:duplicate_item (destructiveSafe) — Monday item lifecycle batch.
 *
 *   setup    create_item    -> create the ORIGINAL smoke item. Capture { itemId }
 *            into ledger key "item".
 *   execute  duplicate_item -> clone the original within the board. Capture the clone
 *            { newItemId } into ledger key "duplicate" (a distinct top-level item).
 *   verify   get_item       -> INDEPENDENT read-back of the DUPLICATE; markerPath
 *            "itemName" confirms the clone carries the run marker (Monday copies the
 *            name, so the marker survives even if the copy is prefixed).
 *   cleanup  delete_item (cleanupEach) -> delete BOTH the original and the duplicate.
 *            They are independent items, so each is deleted directly; every ledger
 *            resource is cleaned. 0 leaked.
 *
 * Board/group discovery + DB-derived connection reuse the create_item foundation.
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "duplicate_item",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
    itemId: "{{ledger.item.id}}",
    withUpdates: false,
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
    // The duplicate is a distinct top-level item -> capture it so it is cleaned too.
    captureResource: { resourceKey: "duplicate", idPath: "newItemId", kind: "item" },
    verify: {
      provider: "monday",
      action: "get_item",
      config: {
        boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
        itemId: "{{ledger.duplicate.id}}",
      },
      // The clone's name carries the run marker (substring survives any copy prefix).
      markerPath: "itemName",
    },
    cleanupKind: "delete",
    // Both the original and the duplicate are independent items -> delete each.
    cleanupEach: {
      provider: "monday",
      action: "delete_item",
      config: {
        boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
        itemId: "{{each.id}}",
      },
    },
  },
  notes:
    "Create original smoke item -> duplicate_item clones it -> get_item read-back " +
    "(marker on the clone) -> delete_item per ledger item (original + duplicate). " +
    "destructiveSafe; 0 leaked.",
});
