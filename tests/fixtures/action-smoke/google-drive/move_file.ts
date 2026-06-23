import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — google-drive:move_file (destructiveSafe, cleaned).
 *
 *   setup    create_folder  -> capture { target } (the move DESTINATION folder)
 *   setup    upload_file     -> capture { movable } (a tiny inline file at My Drive
 *            root, marker-named)
 *   execute  move_file       -> move the movable file INTO the target folder
 *   verify   get_file_metadata -> READ-BACK the moved file and assert BOTH the marker
 *            on its `name` (this is OUR file) AND that `parents` now CONTAINS the
 *            target folder id ({{ledger.target.id}}). move_file's own output echoes
 *            the new parents, so the proof reads the PERSISTED parents independently
 *            (get_file_metadata now surfaces `parents`).
 *   cleanupEach delete_file (permanent) -> delete EVERY smoke-created Drive resource
 *            (the target folder AND the moved file). Partial cleanup is never PASS.
 *
 * All resources are smoke-owned (created this run); no target discovery (root).
 * requiredEnv is only the connection signal.
 */
export default defineWriteSmokeFixture({
  provider: "google-drive",
  action: "move_file",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    fileId: "{{ledger.movable.id}}",
    newParentFolderId: "{{ledger.target.id}}",
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
        config: { name: "{{smokeMarker}}target" },
        captureResource: { resourceKey: "target", idPath: "folderId", kind: "folder" },
      },
      {
        provider: "google-drive",
        action: "upload_file",
        config: {
          filename: "{{smokeMarker}}movable.txt",
          mimeType: "text/plain",
          content: "{{smokeMarker}}content",
          contentEncoding: "utf8",
        },
        captureResource: { resourceKey: "movable", idPath: "fileId", kind: "file" },
      },
    ],
    // Independent read-back: marker still on name AND the file now lives under the
    // target folder (parents contains the captured target id).
    verify: {
      provider: "google-drive",
      action: "get_file_metadata",
      config: { fileId: "{{ledger.movable.id}}" },
      markerPath: "name",
      expectContains: { path: "parents", value: "{{ledger.target.id}}" },
    },
    // Delete EVERY smoke-created resource (target folder + moved file).
    cleanupKind: "delete",
    cleanupEach: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{each.id}}", permanent: true },
    },
  },
  notes:
    "PILOT — create target folder + upload movable file -> move file into target -> " +
    "get_file_metadata read-back (marker on name + parents contains target) -> " +
    "permanent-delete both. Move verified independently via parents. destructiveSafe.",
});
