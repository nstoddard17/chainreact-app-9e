import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — dropbox:upload_file (destructiveSafe, cleaned-to-trash).
 *
 *   execute  upload_file       -> upload a marker-named file to the Dropbox root.
 *            dropbox:upload_file consumes a FileRef (no inline content), so the
 *            bytes come from a v2_storage FileRef the dev test stages in OUR
 *            workflow-files bucket (a SELF-CONTAINED source — never an invented
 *            external URL). The destination name is the marker filename; capture
 *            the persisted { path } into ledger key "file".
 *   verify   get_file_metadata -> READ-BACK by path and confirm the marker on the
 *            PERSISTED `name` AND `isFolder == false`. upload_file derives its name
 *            from the FileRef/filename input, so the read-back is independent.
 *   cleanup  delete_file       -> remove exactly the ledger file
 *
 * The staged source file is a tiny PNG; the smoke marker lives in the FILENAME
 * (independent of the bytes), so the read-back proves the upload by name + type.
 * requiredEnv: the connection signal + the staged file's storage path (set by the
 * dev test; absent -> BLOCKED_ENV, never "not connected").
 *
 * HONESTY — Dropbox `delete` moves the file to TRASH (recoverable ~30d), not a hard
 * erase: there is no permanent-delete on the action. The object is gone from the
 * active namespace (get_metadata then path/not_found), so the harness reports
 * artifact "cleaned"; the certification note discloses the trash semantics.
 */
export default defineWriteSmokeFixture({
  provider: "dropbox",
  action: "upload_file",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    file: {
      kind: "v2_storage",
      name: "{{smokeMarker}}upload.png",
      mimeType: "image/png",
      storagePath: "{{env.SMOKE_DROPBOX_UPLOAD_STORAGE_PATH}}",
    },
    path: "",
    filename: "{{smokeMarker}}upload.png",
    mode: "add",
  },
  requiredEnv: ["SMOKE_DROPBOX_CONNECTED", "SMOKE_DROPBOX_UPLOAD_STORAGE_PATH"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    // Capture the PERSISTED path (Dropbox's resource address) for read-back + delete.
    captureResource: { resourceKey: "file", idPath: "path", kind: "file" },
    // Independent read-back: get_file_metadata returns the persisted name + isFolder.
    verify: {
      provider: "dropbox",
      action: "get_file_metadata",
      config: { path: "{{ledger.file.id}}" },
      markerPath: "name",
      expectEquals: { path: "isFolder", value: false },
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "dropbox",
      action: "delete_file",
      config: { path: "{{ledger.file.id}}" },
    },
  },
  notes:
    "PILOT — upload staged file (v2_storage, marker filename) at root -> " +
    "get_file_metadata read-back marker on name + isFolder==false -> delete (to " +
    "Dropbox trash, recoverable ~30d). Self-contained bytes, no invented URL. destructiveSafe.",
});
