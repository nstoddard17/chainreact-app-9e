import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — microsoft-onedrive:upload_file (destructiveSafe, cleaned-to-recycle).
 *
 *   execute  upload_file   -> upload a marker-named text file to the drive root.
 *            microsoft-onedrive:upload_file takes INLINE content (utf8/base64) — NOT
 *            a FileRef — so this is self-contained with no staging needed (mirrors
 *            Google Drive's upload_file). Capture { itemId } into ledger key "file".
 *   verify   get_file      -> READ-BACK by id and confirm the marker on the PERSISTED
 *            `name` AND `kind == "file"`. upload_file's name falls back to the input
 *            filename, so the read-back is independent.
 *   cleanup  delete_item   -> remove exactly the ledger file
 *
 * Self-contained inline content; the smoke marker lives in the FILENAME, proven by
 * the independent read-back. requiredEnv is only the connection signal.
 *
 * HONESTY — OneDrive `delete_item` moves the file to the RECYCLE BIN (recoverable),
 * not a hard erase. The object is gone from the active drive (get then 404s), so the
 * harness reports artifact "cleaned"; the certification note discloses the
 * recycle-bin semantics.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-onedrive",
  action: "upload_file",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    filename: "{{smokeMarker}}upload.txt",
    mimeType: "text/plain",
    content: "{{smokeMarker}}content",
    contentEncoding: "utf8",
  },
  requiredEnv: ["SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "file", idPath: "itemId", kind: "file" },
    // Independent read-back: get_file returns the persisted name + kind discriminator.
    verify: {
      provider: "microsoft-onedrive",
      action: "get_file",
      config: { itemId: "{{ledger.file.id}}" },
      markerPath: "name",
      expectEquals: { path: "kind", value: "file" },
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-onedrive",
      action: "delete_item",
      config: { itemId: "{{ledger.file.id}}" },
    },
  },
  notes:
    "PILOT — upload tiny inline file (marker filename) at drive root -> get_file " +
    "read-back marker on name + kind==file -> delete (to OneDrive recycle bin, " +
    "recoverable). Self-contained inline content. destructiveSafe.",
});
