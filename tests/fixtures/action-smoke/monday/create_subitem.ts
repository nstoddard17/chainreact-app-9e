import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:create_subitem (destructiveSafe) — Monday item-tree reuse batch.
 *
 *   setup    create_item    -> create a smoke PARENT item on the auto-discovered
 *            board/group. Capture { itemId } into ledger key "item".
 *   execute  create_subitem -> create a smoke-marked subitem ("{{marker}}subitem")
 *            under the ledger parent. NOT captured as a separate ledger resource: a
 *            subitem lives under its parent, and deleting the parent removes its
 *            subitems, so the parent is the single cleanable resource. (A subitem IS
 *            an item, so delete_item could target it directly, but deleting the
 *            parent first would then 404 on the subitem — the cascade is the robust,
 *            0-leak path.)
 *   verify   list_subitems  -> INDEPENDENT read-back of the parent's subitems;
 *            markerPath "subitems" confirms the marker in a returned subitem name.
 *   cleanup  delete_item    -> delete the ledger parent item, which removes the
 *            subitem with it (registered destructive action; smoke-owned). 0 leaked.
 *
 * Cleanup semantics (honest): the subitem is disposed of transitively by deleting
 * its parent item. The ledger holds only the parent; it is the single cleaned
 * resource -> 0 leaked.
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "create_subitem",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    // boardId is a required UI-scope cascade parent for the parentItemId picker (the
    // readiness gate requires it); the handler ignores it (the subitems board is
    // resolved from the parent, D-MON6). Mirrors onenote notebookId.
    boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
    parentItemId: "{{ledger.item.id}}",
    subitemName: "{{smokeMarker}}subitem",
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
    // create_subitem creates the subitem but it is intentionally NOT captured — the
    // parent-item delete disposes of it, so the ledger stays a single cleanable item.
    verify: {
      provider: "monday",
      action: "list_subitems",
      config: {
        // boardId is a required cascade parent on list_subitems too (handler-ignored).
        boardId: "{{env.SMOKE_MONDAY_BOARD_ID}}",
        parentItemId: "{{ledger.item.id}}",
      },
      // The subitem name carries the run marker; it appears in the subitems array.
      markerPath: "subitems",
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
    "Create smoke parent item -> create_subitem adds {{marker}}subitem -> list_subitems " +
    "read-back confirms the marker -> delete_item removes the parent (and its subitem). " +
    "Cascade cleanup; 0 leaked.",
});
