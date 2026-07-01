import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:archive_item (destructiveSafe) — Monday item lifecycle batch.
 *
 *   setup    create_item  -> create a smoke item. Capture { itemId } into ledger "item".
 *   execute  archive_item -> archive the smoke item (Monday archive is UI-recoverable
 *            from the board archive; the item persists in a non-active state).
 *   verify   get_item     -> INDEPENDENT read-back; expectEquals { state == "archived" }
 *            proves the archive landed (items(ids:) returns the item with its state;
 *            the archive handler's structural-only success echo is never trusted).
 *   cleanup  delete_item  -> delete the archived smoke item (registered destructive
 *            action; smoke-owned). A soft delete moves it to the recycle bin, out of
 *            the archive. 0 leaked.
 *
 * Cleanup semantics (honest): archive alone would leave the item in the board's
 * archive (recoverable, but persistent). delete_item disposes of it fully (recycle
 * bin), so the smoke run leaves nothing in the active board OR the archive.
 * boardId is a required cascade parent on both archive_item and get_item (the
 * handlers scope by it); it is threaded from the discovered board.
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "archive_item",
  risk: "write",
  liveRisk: "write",
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
    verify: {
      provider: "monday",
      action: "get_item",
      config: {
        boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
        itemId: "{{ledger.item.id}}",
      },
      // Independent read-back proves the state change no marker could show.
      expectEquals: { path: "state", value: "archived" },
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
    "Create smoke item -> archive_item -> get_item read-back (state == archived) -> " +
    "delete_item disposes of the archived item (recycle bin). destructiveSafe; 0 leaked.",
});
