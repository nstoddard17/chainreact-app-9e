import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — google-drive:delete_file (destructiveSafe, cleaned).
 *
 *   setup    create_folder     -> capture { folderId } (marker-named, smoke-owned)
 *   execute  delete_file (trash) -> move exactly the ledger folder to Drive trash
 *            (permanent:false — recoverable)
 *   verify   get_file_metadata -> READ-BACK and assert `trashed == true`. A trashed
 *            file is still retrievable by id, so this independently proves the
 *            side effect — NOT the delete_file echo (whose `trashed` is coerced).
 *   cleanup  delete_file (permanent) -> permanently remove the trashed ledger folder
 *
 * Operates ONLY on a folder THIS run created. Verifies the trash STATE change
 * independently, then fully cleans up. requiredEnv is only the connection signal.
 */
export default defineWriteSmokeFixture({
  provider: "google-drive",
  action: "delete_file",
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    fileId: "{{ledger.folder.id}}",
    permanent: false,
  },
  requiredEnv: ["SMOKE_GOOGLE_DRIVE_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "google-drive",
        action: "create_folder",
        config: { name: "{{smokeMarker}}folder" },
        captureResource: { resourceKey: "folder", idPath: "folderId", kind: "folder" },
      },
    ],
    // Independent read-back: a trashed file is still gettable by id; assert trashed.
    verify: {
      provider: "google-drive",
      action: "get_file_metadata",
      config: { fileId: "{{ledger.folder.id}}" },
      expectEquals: { path: "trashed", value: true },
    },
    // Permanently remove the trashed smoke folder -> REQUIRED cleanup.
    cleanupKind: "delete",
    cleanup: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{ledger.folder.id}}", permanent: true },
    },
  },
  notes:
    "PILOT — create folder -> delete_file (trash) -> get_file_metadata trashed==true " +
    "(independent) -> permanent delete. Verifies the trash state, not the echo. destructiveSafe.",
});
