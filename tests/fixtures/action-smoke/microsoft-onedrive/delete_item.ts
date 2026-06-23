import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — microsoft-onedrive:delete_item (destructiveSafe, cleaned-to-recycle).
 *
 *   setup    create_folder -> capture { itemId } (marker-named, smoke-owned)
 *   execute  delete_item   -> delete exactly the ledger folder (OneDrive moves it
 *            to the recycle bin; recoverable). The execute IS the disposition
 *            (executeIsCleanup) — there is no permanent-delete to chase it with.
 *   verify   item_metadata -> INDEPENDENT smoke read-back asserting the item is
 *            ABSENT (`exists == false`). A deleted item returns Graph 404 -> TYPED
 *            NotFoundError mapped to exists:false; any other error propagates ->
 *            VERIFY_FAILED (never a false "deleted"). The handler's own
 *            `deleted`/`alreadyMissing` echo is NOT trusted.
 *
 * Operates ONLY on a folder THIS run created. requiredEnv is only the connection
 * signal. There is no separate cleanup step — the delete under test is the cleanup.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-onedrive",
  action: "delete_item",
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    itemId: "{{ledger.folder.id}}",
  },
  requiredEnv: ["SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "microsoft-onedrive",
        action: "create_folder",
        config: { name: "{{smokeMarker}}folder" },
        captureResource: { resourceKey: "folder", idPath: "itemId", kind: "folder" },
      },
    ],
    // The delete under test removes the smoke folder -> it IS the disposition.
    executeIsCleanup: true,
    // Independent absence read-back (smoke-only get-by-id existence probe).
    verify: {
      provider: "microsoft-onedrive",
      action: "item_metadata",
      config: { itemId: "{{ledger.folder.id}}" },
      expectEquals: { path: "exists", value: false },
      smokeRead: true,
    },
  },
  notes:
    "PILOT — create folder -> delete_item (to OneDrive recycle bin) -> independent " +
    "item_metadata exists==false. Absence proven via typed 404 NotFoundError, not the " +
    "handler echo. destructiveSafe.",
});
