import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — google-drive:create_folder (destructiveSafe, cleaned).
 *
 *   execute  create_folder    -> create a marker-named folder in My Drive root;
 *            capture { folderId } into ledger key "folder"
 *   verify   get_file_metadata -> READ-BACK the folder and confirm the marker on
 *            its `name`. create_folder's own output falls back to `config.name`
 *            (input echo), so verification reads the PERSISTED name independently.
 *   cleanup  delete_file (permanent) -> permanently remove exactly the ledger folder
 *
 * No target discovery: a folder with no parent lands in My Drive root (the action's
 * `parentFolderId` is optional). Smoke-owned throughout. requiredEnv is only the
 * connection signal.
 */
export default defineWriteSmokeFixture({
  provider: "google-drive",
  action: "create_folder",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    name: "{{smokeMarker}}folder",
  },
  requiredEnv: ["SMOKE_GOOGLE_DRIVE_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "folder", idPath: "folderId", kind: "folder" },
    // Independent read-back: get_file_metadata returns the persisted `name`.
    verify: {
      provider: "google-drive",
      action: "get_file_metadata",
      config: { fileId: "{{ledger.folder.id}}" },
      markerPath: "name",
    },
    // delete_file (permanent) removes the smoke folder -> REQUIRED cleanup.
    cleanupKind: "delete",
    cleanup: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{ledger.folder.id}}", permanent: true },
    },
  },
  notes:
    "PILOT — create folder (marker) -> get_file_metadata read-back marker on name -> " +
    "permanent delete. No target discovery (My Drive root). destructiveSafe.",
});
