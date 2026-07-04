import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * monday:add_file (writeSafe) — FileRef CONSUMER: upload a deterministic
 * crsmoke- PNG into a file column on a fully smoke-owned board/item.
 *
 *   setup    create_board -> crsmoke- host board (ledger "board").
 *   setup    create_group -> crsmoke- group on it (ledger "group") — create_item
 *            requires an explicit groupId and create_board does not return one.
 *   setup    add_column   -> a FILE-typed column (ledger "column") — Monday's
 *            add_file_to_column requires a real file column (the __item_files__
 *            sentinel is download-only).
 *   setup    create_item  -> crsmoke- item in that group (ledger "item").
 *   execute  add_file     -> resolve bytes from a v2_storage FileRef (a tiny PNG
 *            the dev test stages in OUR workflow-files bucket at
 *            SMOKE_MONDAY_UPLOAD_STORAGE_PATH) and multipart-upload to the file
 *            column. The smoke marker lives in the FILENAME. Capture the Monday
 *            asset id into ledger key "asset". markerEchoPath proves the marker
 *            on the fileName Monday stored (never the bytes).
 *   verify   get_item     -> INDEPENDENT read-back keyed on {{ledger.item.id}};
 *            markerPath "columnValues" confirms the marker filename inside the
 *            PERSISTED file column value (never the upload echo).
 *
 * FILE-OUTPUT CONTRACT: the handler output is { fileId, fileName, fileUrl,
 * itemId, columnId, sizeBytes, uploadedAt } — Monday's own asset metadata, no
 * bytes / base64 / content (enforced by the handler; the dev test additionally
 * regex-scans the serialized report).
 *
 * DISPOSITION: none. No registered Monday board delete exists, so the marked
 * board (group + column + item + uploaded file) stays as one contained,
 * clearly-marked artifact on the throwaway workspace.
 *
 * requiredEnv: the staged source file's storage path (set by the dev test;
 * absent -> BLOCKED_ENV, never "not connected").
 */
export default defineWriteSmokeFixture({
  provider: "monday",
  action: "add_file",
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
    file: {
      kind: "v2_storage",
      name: "{{smokeMarker}}upload.png",
      mimeType: "image/png",
      storagePath: "{{env.SMOKE_MONDAY_UPLOAD_STORAGE_PATH}}",
    },
    filename: "{{smokeMarker}}upload.png",
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
          boardName: "{{smokeMarker}}fileboard",
          boardKind: "public",
          description: "{{smokeMarker}}smoke file host (safe to delete)",
        },
        captureResource: { resourceKey: "board", idPath: "boardId", kind: "board" },
      },
      {
        provider: "monday",
        action: "create_group",
        config: { boardId: "{{ledger.board.id}}", groupTitle: "{{smokeMarker}}filegroup" },
        captureResource: { resourceKey: "group", idPath: "groupId", kind: "group" },
      },
      {
        provider: "monday",
        action: "add_column",
        config: {
          boardId: "{{ledger.board.id}}",
          columnTitle: "{{smokeMarker}}files",
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
          itemName: "{{smokeMarker}}fileitem",
        },
        captureResource: { resourceKey: "item", idPath: "itemId", kind: "item" },
      },
    ],
    captureResource: { resourceKey: "asset", idPath: "fileId", kind: "file" },
    markerEchoPath: "fileName",
    verify: {
      provider: "monday",
      action: "get_item",
      // boardId is meta-required for get_item (readiness gate), same as execute.
      config: { boardId: "{{ledger.board.id}}", itemId: "{{ledger.item.id}}" },
      markerPath: "columnValues",
    },
    // No cleanup: no registered board delete -> one contained marked board left.
  },
  notes:
    "board -> group -> file column -> item (all smoke-owned) -> add_file from a " +
    "staged v2_storage PNG (marker filename) -> get_item read-back proves the " +
    "marker inside the persisted file column value. writeSafe; one marked board " +
    "artifact left. Output is Monday asset metadata only, no bytes.",
});
