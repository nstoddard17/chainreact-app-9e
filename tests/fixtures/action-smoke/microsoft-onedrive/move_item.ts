import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onedrive:move_item (destructiveSafe, cleaned-to-recycle) — SMOKE-WRITE-26.
 *
 *   setup    upload_file   -> upload a SMOKE-OWNED source file ("<marker>src.txt")
 *            at the drive root from INLINE content (no FileRef/staging). Capture
 *            { itemId } into ledger key "file".
 *            create_folder -> create a SMOKE-OWNED destination folder
 *            ("<marker>dest"). Capture { itemId } into ledger key "folder".
 *            ORDER MATTERS: "file" is captured BEFORE "folder" so cleanup deletes
 *            the moved file FIRST and its parent folder SECOND (deleting the folder
 *            first would recursively remove the moved file inside it, and the
 *            follow-up file delete would 404 -> CLEANUP_FAILED).
 *   execute  move_item     -> ATOMIC move + rename: relocate the smoke file INTO the
 *            smoke folder AND rename it to "<marker>moved.txt" in one Graph PATCH.
 *            The OneDrive driveItem id is STABLE across a move/rename, so re-capture
 *            the (same) itemId back into "file" — the ledger tracks the file's
 *            current authoritative id.
 *   verify   get_file      -> INDEPENDENT read-back by id proving THREE things the
 *            handler echo cannot (its name falls back to input):
 *              - marker + suffix "moved" on the PERSISTED `name` (the source was
 *                "<marker>src", so this proves the RENAME landed, not a no-op);
 *              - `kind == "file"`;
 *              - `parentReference.id == {{ledger.folder.id}}` — proves the file's
 *                parent is now the SMOKE-OWNED folder (the MOVE landed), compared
 *                against the captured folder id, never an input echo.
 *   cleanup  delete_item (each) -> delete BOTH ledger items (moved file, then folder).
 *            Both must clean or the run is CLEANUP_FAILED.
 *
 * Operates ONLY on items THIS run created (root-level source + smoke folder).
 * requiredEnv is only the connection signal.
 *
 * HONESTY — OneDrive `delete_item` moves items to the RECYCLE BIN (recoverable),
 * not a hard erase. Both smoke items leave the active drive (get then 404s), so the
 * harness reports artifact "cleaned"; the certification note discloses the
 * recycle-bin semantics.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-onedrive",
  action: "move_item",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    // itemId = the smoke source uploaded in setup (ledger ref, never a literal).
    itemId: "{{ledger.file.id}}",
    // Atomic move + rename: into the smoke folder, renamed with a distinguishing suffix.
    targetParentItemId: "{{ledger.folder.id}}",
    newName: "{{smokeMarker}}moved.txt",
  },
  requiredEnv: ["SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      // "file" captured FIRST -> cleanup deletes it before the parent folder.
      {
        provider: "microsoft-onedrive",
        action: "upload_file",
        config: {
          filename: "{{smokeMarker}}src.txt",
          mimeType: "text/plain",
          content: "{{smokeMarker}}content",
          contentEncoding: "utf8",
        },
        captureResource: { resourceKey: "file", idPath: "itemId", kind: "file" },
      },
      // "folder" captured SECOND -> cleaned after the file it now contains.
      {
        provider: "microsoft-onedrive",
        action: "create_folder",
        config: { name: "{{smokeMarker}}dest" },
        captureResource: { resourceKey: "folder", idPath: "itemId", kind: "folder" },
      },
    ],
    // Re-capture the moved file's (stable) id into the SAME "file" key — keeps the
    // ledger authoritative; Map.set preserves the file-before-folder ordering.
    captureResource: { resourceKey: "file", idPath: "itemId", kind: "file" },
    verify: {
      provider: "microsoft-onedrive",
      action: "get_file",
      config: { itemId: "{{ledger.file.id}}" },
      // (1) marker + suffix "moved" on the persisted name -> proves the RENAME landed
      //     (the source was "<marker>src", so a no-op would fail this).
      markerPath: "name",
      markerSuffix: "moved",
      // (2) kind == "file" -> proves the read-back is the file, not a folder.
      expectEquals: { path: "kind", value: "file" },
      // (3) parentReference.id == the captured smoke folder id -> proves the MOVE
      //     landed in the SMOKE-OWNED folder. expectContains treats a scalar path as
      //     a single-element membership check and resolves the {{ledger.*}} token, so
      //     it compares the persisted parent against a smoke-owned id (never an echo).
      expectContains: { path: "parentReference.id", value: "{{ledger.folder.id}}" },
    },
    cleanupEach: {
      provider: "microsoft-onedrive",
      action: "delete_item",
      config: { itemId: "{{each.id}}" },
    },
    cleanupKind: "delete",
  },
  notes:
    "SMOKE-WRITE-26 — setup upload smoke src + create smoke dest folder (file " +
    "captured before folder for safe cleanup order) -> move_item atomic move+rename " +
    "into the folder -> get_file read-back marker(+suffix moved) on name + kind==file " +
    "+ parentReference.id==smoke folder -> delete BOTH (recycle bin, recoverable). " +
    "destructiveSafe.",
});
