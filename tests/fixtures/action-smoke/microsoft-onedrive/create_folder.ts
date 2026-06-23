import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — microsoft-onedrive:create_folder (destructiveSafe, cleaned-to-recycle).
 *
 *   execute  create_folder -> create a marker-named folder at the drive root
 *            (parentItemId omitted; the wrapper sets conflictBehavior "fail" so a
 *            name clash errors rather than silently renaming); capture { itemId }
 *            into ledger key "folder"
 *   verify   get_file      -> READ-BACK the DriveItem by id and confirm the marker
 *            on the PERSISTED `name` AND `kind == "folder"`. Independent of the
 *            create echo.
 *   cleanup  delete_item   -> remove exactly the ledger folder
 *
 * No target discovery: the drive root needs no smoke-target env. Smoke-owned
 * throughout. requiredEnv is only the connection signal.
 *
 * HONESTY — OneDrive `delete_item` moves the folder to the RECYCLE BIN (recoverable),
 * not a hard erase. The object is gone from the active drive (get then 404s), so the
 * harness reports artifact "cleaned"; the certification note discloses the
 * recycle-bin semantics.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-onedrive",
  action: "create_folder",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    name: "{{smokeMarker}}folder",
  },
  requiredEnv: ["SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "folder", idPath: "itemId", kind: "folder" },
    // Independent read-back: get_file returns the persisted name + kind discriminator.
    verify: {
      provider: "microsoft-onedrive",
      action: "get_file",
      config: { itemId: "{{ledger.folder.id}}" },
      markerPath: "name",
      expectEquals: { path: "kind", value: "folder" },
    },
    // delete_item removes the smoke folder (OneDrive: to recycle bin) -> REQUIRED.
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-onedrive",
      action: "delete_item",
      config: { itemId: "{{ledger.folder.id}}" },
    },
  },
  notes:
    "PILOT — create folder at drive root (marker) -> get_file read-back marker on " +
    "name + kind==folder -> delete (to OneDrive recycle bin, recoverable). destructiveSafe.",
});
