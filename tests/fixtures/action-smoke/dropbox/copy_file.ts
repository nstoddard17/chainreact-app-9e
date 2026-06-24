import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * dropbox:copy_file (destructiveSafe, cleaned-to-trash) — SMOKE-WRITE-25.
 *
 *   setup    upload_file       -> stage a SMOKE-OWNED source file at the Dropbox
 *            root from a v2_storage FileRef (the same staged 1x1 PNG the
 *            upload_file pilot uses — a SELF-CONTAINED source, never an invented
 *            external URL). Capture its persisted { path } into ledger key
 *            "source".
 *   execute  copy_file         -> copy the smoke source to a DISTINCT marker-named
 *            path ("/<marker>copy.png"). Capture the copy's persisted { path }
 *            into ledger key "copy". Two smoke-owned files now exist.
 *   verify   get_file_metadata -> READ-BACK the COPY by its persisted path and
 *            confirm the marker on the PERSISTED `name` (markerSuffix "copy" so the
 *            check requires "<marker>copy" — the SOURCE name carries "src", so this
 *            proves we read the COPY, not the original) AND `isFolder == false`.
 *            copy_file's own output is never trusted; the get is independent.
 *   cleanup  delete_file (each) -> delete BOTH ledger files (source + copy). Fans
 *            over every captured ledger resource; each is its own delete. Both must
 *            clean or the run is CLEANUP_FAILED (never a partial-clean pass).
 *
 * The smoke marker lives in the FILENAME (independent of the copied bytes), so the
 * read-back proves the copy by name + type. requiredEnv: the connection signal +
 * the staged source's storage path (set by the dev test; absent -> BLOCKED_ENV,
 * never "not connected").
 *
 * HONESTY — Dropbox `delete` moves a file to TRASH (recoverable ~30d), not a hard
 * erase. Both smoke files are gone from the active namespace (get_metadata then
 * path/not_found), so the harness reports artifact "cleaned"; the certification
 * note discloses the trash semantics.
 */
export default defineWriteSmokeFixture({
  provider: "dropbox",
  action: "copy_file",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    // fromPath = the smoke source uploaded in setup (ledger ref, never a literal).
    fromPath: "{{ledger.source.id}}",
    // toPath = a DISTINCT marker-named destination so the copy is its own resource.
    toPath: "/{{smokeMarker}}copy.png",
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
        // Capture the PERSISTED source path for the copy's fromPath + cleanup.
        captureResource: { resourceKey: "source", idPath: "path", kind: "file" },
      },
    ],
    // Capture the PERSISTED copy path (a SECOND smoke-owned file) for read-back + delete.
    captureResource: { resourceKey: "copy", idPath: "path", kind: "file" },
    verify: {
      provider: "dropbox",
      action: "get_file_metadata",
      config: { path: "{{ledger.copy.id}}" },
      markerPath: "name",
      // "<marker>copy" — the source name is "<marker>src", so this proves the
      // read-back is the COPY, not the original (presence-only would not).
      markerSuffix: "copy",
      expectEquals: { path: "isFolder", value: false },
    },
    // Delete BOTH smoke files (source + copy) — cleanupEach fans over every ledger
    // resource this run created. Both are dropbox -> no cross-provider concern.
    cleanupEach: {
      provider: "dropbox",
      action: "delete_file",
      config: { path: "{{each.id}}" },
    },
    cleanupKind: "delete",
  },
  notes:
    "SMOKE-WRITE-25 — setup upload smoke source -> copy_file to a distinct marker " +
    "path -> get_file_metadata read-back marker(+suffix copy) on name + " +
    "isFolder==false -> delete BOTH files (to Dropbox trash, recoverable ~30d). " +
    "Self-contained bytes, no invented URL. destructiveSafe.",
});
