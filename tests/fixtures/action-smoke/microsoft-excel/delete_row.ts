import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";
import { MINIMAL_XLSX_BASE64 } from "@/tests/smoke-actions/minimalXlsx";

/**
 * microsoft-excel:delete_row (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-41.
 *
 * Reuses the SMOKE-WRITE-36 Excel bootstrap. `delete_row` is POSITION-based: config is
 * `{ workbookId, worksheetName, rowNumber (1-based) }` — it deletes the FULL row at
 * `rowNumber` (`"{N}:{N}"`) and shifts subsequent rows UP (`shift: "Up"`). No header /
 * usedRange read, no search-then-delete. Positional deletion is only ambiguous on a
 * SHARED sheet; inside the SAME-RUN smoke workbook WE seed, the row positions are fully
 * deterministic, so the delete + the row SHIFT it causes are independently provable.
 * No user/customer workbook is ever touched.
 *
 *   setup#1  onedrive:upload_file -> upload the minimal workbook (empty `Sheet1`). Capture
 *            { itemId } into ledger key "workbook".
 *   setup#2  excel:add_row        -> A1 = "{{marker}}keep-before"  (row 1)
 *   setup#3  excel:add_row        -> A2 = "{{marker}}delete-me"    (row 2 — the target)
 *   setup#4  excel:add_row        -> A3 = "{{marker}}keep-after"   (row 3)
 *   execute  excel:delete_row     -> delete row 2. Excel shifts rows below UP, so after:
 *            A1 unchanged, A2 == the old A3 value, A3 blank. The handler's `deleted: true`
 *            is a hard-coded echo, never trusted.
 *   verify   verifyAll (3 INDEPENDENT read_range reads that together pin EXACTLY row 2):
 *              A1     -> marker(+suffix "keep-before")  (row 1 was NOT deleted)
 *              A2     -> marker(+suffix "keep-after")   (row 3 SHIFTED UP into row 2 ->
 *                                                        row 2 was the one removed)
 *              A1:A3  -> expectAbsent "{{marker}}delete-me" (the deleted value is GONE from
 *                                                        the whole column — not merely moved)
 *   cleanup  onedrive:delete_item -> remove the WHOLE smoke workbook file (same OneDrive
 *            provider that created it — NOT cross-provider). A workbook-session lock right
 *            after the edits is absorbed by the bounded OneDrive delete retry.
 *
 * The three facts are mutually constraining: the ONLY single-row deletion consistent with
 * (A1 kept, A2 == old A3, delete-me absent) is "row 2 deleted". A no-op leaves A2 ==
 * "delete-me" (fails the "keep-after" suffix AND the expectAbsent); deleting the WRONG row
 * fails A1 or A2. Independent live reads, no echo. requiredEnv is the two connection signals.
 *
 * NOT live-certified yet — live workflow-run smokes are blocked by an unrelated durable-queue
 * enum WIP (`workflow_runs.status = "queued"` not yet in the DB enum). NOT_RUN_READY: authored
 * + offline-validated; cert deferred until the engine unblocks.
 *
 * HONESTY — `microsoft-onedrive:delete_item` moves the file to the RECYCLE BIN
 * (recoverable), not a hard erase; the object is gone from the active drive (get/list
 * then 404s), so the harness reports artifact "cleaned" and the cert note discloses the
 * recycle-bin semantics (same disclosure as the OneDrive write certs).
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-excel",
  action: "delete_row",
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    workbookId: "{{ledger.workbook.id}}",
    worksheetName: "Sheet1",
    rowNumber: 2,
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_EXCEL_CONNECTED",
    "SMOKE_MICROSOFT_ONEDRIVE_CONNECTED",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "microsoft-onedrive",
        action: "upload_file",
        config: {
          filename: "{{smokeMarker}}workbook.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          content: MINIMAL_XLSX_BASE64,
          contentEncoding: "base64",
        },
        captureResource: { resourceKey: "workbook", idPath: "itemId", kind: "workbook" },
      },
      {
        // A1 (empty sheet -> add_row appends at A1).
        provider: "microsoft-excel",
        action: "add_row",
        config: { workbookId: "{{ledger.workbook.id}}", worksheetName: "Sheet1", values: ["{{smokeMarker}}keep-before"] },
      },
      {
        // A2 — the row to delete.
        provider: "microsoft-excel",
        action: "add_row",
        config: { workbookId: "{{ledger.workbook.id}}", worksheetName: "Sheet1", values: ["{{smokeMarker}}delete-me"] },
      },
      {
        // A3 — should shift up into A2 after the delete.
        provider: "microsoft-excel",
        action: "add_row",
        config: { workbookId: "{{ledger.workbook.id}}", worksheetName: "Sheet1", values: ["{{smokeMarker}}keep-after"] },
      },
    ],
    // Three INDEPENDENT bounded reads that together prove row 2 (and only row 2) was deleted.
    verifyAll: [
      {
        provider: "microsoft-excel",
        action: "read_range",
        config: { workbookId: "{{ledger.workbook.id}}", worksheetName: "Sheet1", address: "A1" },
        markerPath: "values",
        markerSuffix: "keep-before",
      },
      {
        provider: "microsoft-excel",
        action: "read_range",
        config: { workbookId: "{{ledger.workbook.id}}", worksheetName: "Sheet1", address: "A2" },
        markerPath: "values",
        markerSuffix: "keep-after",
      },
      {
        provider: "microsoft-excel",
        action: "read_range",
        config: { workbookId: "{{ledger.workbook.id}}", worksheetName: "Sheet1", address: "A1:A3" },
        expectAbsent: { path: "values", value: "{{smokeMarker}}delete-me" },
      },
    ],
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-onedrive",
      action: "delete_item",
      config: { itemId: "{{ledger.workbook.id}}" },
    },
  },
  notes:
    "SMOKE-WRITE-41 — upload minimal .xlsx (empty 'Sheet1') -> add_row A1 keep-before / A2 " +
    "delete-me / A3 keep-after -> excel:delete_row row 2 (shifts up) -> verifyAll: A1==keep-before, " +
    "A2==keep-after (shifted), A1:A3 lacks delete-me (pins row 2 deleted) -> onedrive:delete_item " +
    "removes the whole file (recycle bin, recoverable). destructiveSafe. NOT live-certified yet " +
    "(durable-queue enum blocker).",
});
