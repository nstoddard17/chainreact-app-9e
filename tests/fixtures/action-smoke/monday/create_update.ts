import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:create_update (destructiveSafe) — Monday item-tree reuse batch.
 *
 *   setup    create_item   -> create a smoke item on the auto-discovered board/group.
 *            Capture { itemId } into ledger key "item".
 *   execute  create_update -> post a smoke-marked update ("{{marker}}update") on the
 *            ledger item. NOT captured as a separate ledger resource — Monday has no
 *            registered delete_update action, and an update is CONTAINED in its item:
 *            deleting the parent item removes the update. Capturing it would report a
 *            false leak (nothing cleans an update independently).
 *   verify   list_updates  -> INDEPENDENT read-back of the item's updates; markerPath
 *            "updates" confirms the marker in a returned update body (not the create
 *            echo).
 *   cleanup  delete_item   -> delete the ledger parent item, which removes the update
 *            with it (registered destructive action; smoke-owned). 0 leaked.
 *
 * Cleanup semantics (honest): there is no monday:delete_update action, so the update
 * is disposed of transitively by deleting its parent item. The ledger holds only the
 * parent item; it is the single cleaned resource -> 0 leaked.
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "create_update",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    // boardId is a required UI-scope cascade parent for the itemId picker (the
    // readiness gate requires it); the handler ignores it. Mirrors onenote notebookId.
    boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
    itemId: "{{ledger.item.id}}",
    body: "{{smokeMarker}}update",
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
    // create_update creates the update but it is intentionally NOT captured — the
    // parent-item delete disposes of it, so the ledger stays a single cleanable item.
    verify: {
      provider: "monday",
      action: "list_updates",
      config: {
        // boardId is a required cascade parent on list_updates too (handler-ignored).
        boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
        itemId: "{{ledger.item.id}}",
      },
      // The posted update body carries the run marker; it appears in the updates array.
      markerPath: "updates",
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
    "Create smoke item -> create_update posts {{marker}}update -> list_updates read-back " +
    "confirms the marker -> delete_item removes the parent (and its update). No " +
    "delete_update action exists, so the update is cleaned transitively. 0 leaked.",
});
