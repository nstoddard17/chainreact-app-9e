import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — dropbox:create_folder (destructiveSafe, cleaned-to-trash).
 *
 *   execute  create_folder     -> create a marker-named folder at the Dropbox root
 *            (`/{{smokeMarker}}folder`); capture { path } into ledger key "folder"
 *            (Dropbox addresses resources by PATH, and the action returns the
 *            persisted path)
 *   verify   get_file_metadata -> READ-BACK the folder by its path and confirm the
 *            marker on the PERSISTED `name` AND `isFolder == true`. create_folder's
 *            output derives name from the path, so the read-back is independent.
 *   cleanup  delete_file       -> remove exactly the ledger folder
 *
 * No target discovery: a root path needs no smoke-target env. Smoke-owned
 * throughout. requiredEnv is only the connection signal.
 *
 * HONESTY — Dropbox `delete` moves the folder to TRASH (recoverable ~30 days), not
 * a hard erase: there is no permanent-delete option on the action. The object is
 * gone from the active namespace (get_metadata then returns path/not_found), so the
 * harness reports artifact "cleaned"; the certification note discloses the trash
 * semantics.
 */
export default defineWriteSmokeFixture({
  provider: "dropbox",
  action: "create_folder",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    path: "/{{smokeMarker}}folder",
    autorename: false,
  },
  requiredEnv: ["SMOKE_DROPBOX_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    // Capture the PERSISTED path (Dropbox's resource address) for read-back + delete.
    captureResource: { resourceKey: "folder", idPath: "path", kind: "folder" },
    // Independent read-back: get_file_metadata returns the persisted name + isFolder.
    verify: {
      provider: "dropbox",
      action: "get_file_metadata",
      config: { path: "{{ledger.folder.id}}" },
      markerPath: "name",
      expectEquals: { path: "isFolder", value: true },
    },
    // delete_file removes the smoke folder (Dropbox: to trash) -> REQUIRED cleanup.
    cleanupKind: "delete",
    cleanup: {
      provider: "dropbox",
      action: "delete_file",
      config: { path: "{{ledger.folder.id}}" },
    },
  },
  notes:
    "PILOT — create folder at root (marker) -> get_file_metadata read-back marker on " +
    "name + isFolder -> delete (to Dropbox trash, recoverable ~30d). destructiveSafe.",
});
