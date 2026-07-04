import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:download_file (writeSafe) — FileRef PRODUCER: download a smoke-uploaded
 * Monday asset and stage its bytes to OUR v2_storage, proving BOTH the metadata
 * round-trip AND that a real, non-empty staged object landed (honoring the
 * file-output contract: no bytes surface).
 *
 *   setup    create_board / create_group / add_column(file) / create_item —
 *            the same fully smoke-owned chain as monday:add_file.
 *   setup    add_file      -> upload the crsmoke- PNG (from the staged
 *            v2_storage source at SMOKE_MONDAY_UPLOAD_STORAGE_PATH) so there is
 *            a real Monday asset to download. Capture its id (ledger "srcfile").
 *   execute  download_file -> resolve the asset on the file column, fetch bytes
 *            via Monday's temporary public_url, stageFileToStorage. Returns
 *            { file: FileRef(v2_storage), fileId, fileName, mimeType, sizeBytes }
 *            — NO bytes/base64/content (contract enforced by the handler).
 *            markerEchoPath proves the returned fileName carries the marker
 *            (Monday's authoritative asset metadata, not an input echo — the
 *            fixture only passes ids). Capture the output FileRef's
 *            `file.storagePath` into ledger key "staged".
 *   verify   staged_file (SMOKE READ-BACK) -> reads OUR workflow-files bucket at
 *            that storagePath and asserts `exists == true` (independent proof
 *            the bytes were actually staged). The seam returns only
 *            { exists, sizeBytes } — never bytes.
 *
 * DISPOSITION: none. The staged v2_storage object has no registered delete
 * action (harmless marked artifact, slack:download_file precedent), and the
 * marked host board (with its uploaded asset) is left too — no registered
 * Monday board delete. One contained marked board + one tiny staged object per
 * run.
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "download_file",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    // boardId is UI-scope only (the handler ignores it) but the ActionMeta marks it
    // required for the builder's cascading pickers, and the run readiness gate
    // enforces meta-required fields — so the smoke board id is passed explicitly.
    boardId: "{{ledger.board.id}}",
    itemId: "{{ledger.item.id}}",
    columnId: "{{ledger.column.id}}",
    fileId: "{{ledger.srcfile.id}}",
  },
  requiredEnv: ["SMOKE_MONDAY_UPLOAD_STORAGE_PATH"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "monday",
        action: "create_board",
        config: {
          boardName: "{{smokeMarker}}dlboard",
          boardKind: "public",
          description: "{{smokeMarker}}smoke download host (safe to delete)",
        },
        captureResource: { resourceKey: "board", idPath: "boardId", kind: "board" },
      },
      {
        provider: "monday",
        action: "create_group",
        config: { boardId: "{{ledger.board.id}}", groupTitle: "{{smokeMarker}}dlgroup" },
        captureResource: { resourceKey: "group", idPath: "groupId", kind: "group" },
      },
      {
        provider: "monday",
        action: "add_column",
        config: {
          boardId: "{{ledger.board.id}}",
          columnTitle: "{{smokeMarker}}dlfiles",
          columnType: "file",
        },
        captureResource: { resourceKey: "column", idPath: "columnId", kind: "column" },
      },
      {
        provider: "monday",
        action: "create_item",
        config: {
          boardId: "{{ledger.board.id}}",
          groupId: "{{ledger.group.id}}",
          itemName: "{{smokeMarker}}dlitem",
        },
        captureResource: { resourceKey: "item", idPath: "itemId", kind: "item" },
      },
      {
        provider: "monday",
        action: "add_file",
        config: {
          boardId: "{{ledger.board.id}}",
          itemId: "{{ledger.item.id}}",
          columnId: "{{ledger.column.id}}",
          file: {
            kind: "v2_storage",
            name: "{{smokeMarker}}upload.png",
            mimeType: "image/png",
            storagePath: "{{env.SMOKE_MONDAY_UPLOAD_STORAGE_PATH}}",
          },
          filename: "{{smokeMarker}}upload.png",
        },
        captureResource: { resourceKey: "srcfile", idPath: "fileId", kind: "file" },
      },
    ],
    // Capture the staged output FileRef's storagePath for the independent bucket
    // read-back (the ledger id IS the storagePath — slack:download_file precedent).
    captureResource: { resourceKey: "staged", idPath: "file.storagePath", kind: "staged_file" },
    // The returned fileName (Monday's asset metadata) must carry the marker —
    // proves the right asset was downloaded (not an input echo).
    markerEchoPath: "fileName",
    verify: {
      provider: "monday",
      action: "staged_file",
      config: { storagePath: "{{ledger.staged.id}}" },
      smokeRead: true,
      expectEquals: { path: "exists", value: true },
    },
    // No cleanup: no registered delete for v2_storage objects or Monday boards.
  },
  notes:
    "smoke-owned board/group/file-column/item + add_file (real Monday asset) -> " +
    "download_file stages bytes to v2_storage -> markerEchoPath proves fileName + " +
    "staged_file read-back proves the object exists. writeSafe; marked board + " +
    "staged-object artifacts. Output is FileRef(v2_storage), no bytes.",
});
