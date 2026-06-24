import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * dropbox:move_file (destructiveSafe, cleaned-to-trash) — SMOKE-WRITE-25.
 *
 *   setup    upload_file       -> stage a SMOKE-OWNED source file at the Dropbox
 *            root ("/<marker>src.png") from a v2_storage FileRef (the same staged
 *            1x1 PNG the upload pilot uses — SELF-CONTAINED, never an external URL).
 *            Capture its persisted { path } into ledger key "file".
 *   execute  move_file         -> move that smoke file to a DISTINCT marker-named
 *            path ("/<marker>moved.png"). A move is a RELOCATION, not a copy: only
 *            ONE physical file exists before and after. Capture the moved file's
 *            persisted { path } back into the SAME ledger key "file", so the ledger
 *            always tracks the file's CURRENT (single) address — never a stale path.
 *   verify   get_file_metadata -> READ-BACK the moved file by its NEW persisted path
 *            and confirm the marker on the PERSISTED `name` (markerSuffix "moved" so
 *            the check requires "<marker>moved" — the original was "<marker>src", so
 *            this proves the file landed at the new name/location) AND
 *            `isFolder == false`. move_file's own output is never trusted.
 *   cleanup  delete_file       -> delete the file at its current ("file") path.
 *            Single resource (the relocation never created a second file).
 *
 * Why re-capture into the SAME key: capturing the move output under a new key would
 * leave the setup "source" ledger entry pointing at the OLD path (gone after the
 * move) — cleanup would then fail trying to delete a vanished path and falsely
 * report CLEANUP_FAILED. Overwriting "file" keeps the ledger truthful: one file,
 * current address, cleaned exactly once.
 *
 * HONESTY — Dropbox `delete` moves the file to TRASH (recoverable ~30d), not a hard
 * erase. The file is gone from the active namespace, so artifact "cleaned"; the
 * certification note discloses the trash semantics. requiredEnv: connection signal
 * + the staged source's storage path (absent -> BLOCKED_ENV, never "not connected").
 */
export default defineWriteSmokeFixture({
  provider: "dropbox",
  action: "move_file",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    // fromPath = the smoke source uploaded in setup (ledger ref, resolved BEFORE
    // the execute output overwrites the key — so it is the OLD path at move time).
    fromPath: "{{ledger.file.id}}",
    toPath: "/{{smokeMarker}}moved.png",
    autorename: false,
  },
  requiredEnv: ["SMOKE_DROPBOX_CONNECTED", "SMOKE_DROPBOX_UPLOAD_STORAGE_PATH"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "dropbox",
        action: "upload_file",
        config: {
          file: {
            kind: "v2_storage",
            name: "{{smokeMarker}}src.png",
            mimeType: "image/png",
            storagePath: "{{env.SMOKE_DROPBOX_UPLOAD_STORAGE_PATH}}",
          },
          path: "",
          filename: "{{smokeMarker}}src.png",
          mode: "add",
        },
        captureResource: { resourceKey: "file", idPath: "path", kind: "file" },
      },
    ],
    // Re-capture the moved file's NEW path into the SAME "file" key (see header).
    captureResource: { resourceKey: "file", idPath: "path", kind: "file" },
    verify: {
      provider: "dropbox",
      action: "get_file_metadata",
      config: { path: "{{ledger.file.id}}" },
      markerPath: "name",
      // "<marker>moved" — proves the read-back is the relocated/renamed file, not
      // the original "<marker>src" name.
      markerSuffix: "moved",
      expectEquals: { path: "isFolder", value: false },
    },
    cleanup: {
      provider: "dropbox",
      action: "delete_file",
      config: { path: "{{ledger.file.id}}" },
    },
    cleanupKind: "delete",
  },
  notes:
    "SMOKE-WRITE-25 — setup upload smoke source -> move_file to a distinct marker " +
    "path (re-capture into the same ledger key: one file, current address) -> " +
    "get_file_metadata read-back marker(+suffix moved) on name + isFolder==false " +
    "-> delete the moved file (to Dropbox trash, recoverable ~30d). destructiveSafe.",
});
