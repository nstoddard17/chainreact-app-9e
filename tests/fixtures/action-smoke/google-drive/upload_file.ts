import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — google-drive:upload_file (destructiveSafe, cleaned).
 *
 *   execute  upload_file       -> upload a tiny marker-named text file (inline
 *            content — NO FileRef/staging needed) to My Drive root; capture
 *            { fileId } into ledger key "file"
 *   verify   get_file_metadata -> READ-BACK the file and confirm the marker on its
 *            `name`. upload_file's own output falls back to `config.filename`
 *            (input echo), so verification reads the PERSISTED name independently.
 *   cleanup  delete_file (permanent) -> permanently remove exactly the ledger file
 *
 * Self-contained: `content` is an inline string, so no external URL / staged file.
 * Smoke-owned throughout. requiredEnv is only the connection signal.
 */
export default defineWriteSmokeFixture({
  provider: "google-drive",
  action: "upload_file",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    filename: "{{smokeMarker}}file.txt",
    mimeType: "text/plain",
    content: "{{smokeMarker}}content",
    contentEncoding: "utf8",
  },
  requiredEnv: ["SMOKE_GOOGLE_DRIVE_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "file", idPath: "fileId", kind: "file" },
    verify: {
      provider: "google-drive",
      action: "get_file_metadata",
      config: { fileId: "{{ledger.file.id}}" },
      markerPath: "name",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{ledger.file.id}}", permanent: true },
    },
  },
  notes:
    "PILOT — upload tiny inline file (marker filename) -> get_file_metadata read-back " +
    "marker on name -> permanent delete. Self-contained inline content. destructiveSafe.",
});
