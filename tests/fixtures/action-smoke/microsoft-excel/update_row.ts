import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";
import { MINIMAL_XLSX_BASE64 } from "@/tests/smoke-actions/minimalXlsx";

/**
 * microsoft-excel:update_row (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-40.
 *
 * Reuses the SMOKE-WRITE-36 Excel bootstrap (smoke-owned uploaded workbook). `update_row`
 * is HEADER-based: it reads row 1 as column headers, maps each `values` key (a column
 * header NAME) to a column letter, and PATCHes the target `rowNumber`. So the workbook
 * must have a header row + a data row before the update — both seeded deterministically
 * here with `add_row` against the frozen minimal `.xlsx` (empty `Sheet1`). No user/customer
 * workbook is ever touched.
 *
 *   setup#1  onedrive:upload_file -> upload the minimal workbook (marker FILENAME). Capture
 *            { itemId } into ledger key "workbook".
 *   setup#2  excel:add_row        -> write the header row ["Col"] at A1 (empty sheet -> A1).
 *   setup#3  excel:add_row        -> append the SEED data row ["{{marker}}seed"] at A2.
 *   execute  excel:update_row     -> update row 2's "Col" cell to "{{marker}}updated". The
 *            handler's columnsUpdated/echo is never trusted.
 *   verify   excel:read_range     -> INDEPENDENT read-back of A2; confirm the marker(+suffix
 *            "updated") on the persisted cell value. The SEED value ("{{marker}}seed") carries
 *            the run marker but NOT the "updated" suffix, so a no-op update FAILS the check.
 *   cleanup  onedrive:delete_item -> remove the WHOLE smoke workbook file (same OneDrive
 *            provider that created it — NOT cross-provider). A workbook-session lock right
 *            after the edits is absorbed by the bounded OneDrive delete retry.
 *
 * Verified-by-read-back, smoke-owned throughout, zero leaked. requiredEnv is the two
 * connection signals (Excel for the action under test; OneDrive for setup + cleanup).
 *
 * NOT live-certified yet — live workflow-run smokes are blocked by an unrelated durable-queue
 * enum WIP (`workflow_runs.status = "queued"` not yet in the DB enum). This fixture is
 * NOT_RUN_READY: authored + offline-validated; cert deferred until the engine unblocks.
 *
 * HONESTY — `microsoft-onedrive:delete_item` moves the file to the RECYCLE BIN
 * (recoverable), not a hard erase; the object is gone from the active drive (get/list
 * then 404s), so the harness reports artifact "cleaned" and the cert note discloses the
 * recycle-bin semantics (same disclosure as the OneDrive write certs).
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-excel",
  action: "update_row",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    workbookId: "{{ledger.workbook.id}}",
    worksheetName: "Sheet1",
    // Row 1 is the header ("Col"); row 2 is the seeded data row to update.
    rowNumber: 2,
    values: { Col: "{{smokeMarker}}updated" },
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
        // Header row at A1 (empty sheet -> add_row appends at A1).
        provider: "microsoft-excel",
        action: "add_row",
        config: { workbookId: "{{ledger.workbook.id}}", worksheetName: "Sheet1", values: ["Col"] },
      },
      {
        // Seed data row at A2 (used range now has the header row -> appends at row 2).
        provider: "microsoft-excel",
        action: "add_row",
        config: { workbookId: "{{ledger.workbook.id}}", worksheetName: "Sheet1", values: ["{{smokeMarker}}seed"] },
      },
    ],
    // Independent read-back: read_range A2 returns the updated cell value (marker+suffix).
    verify: {
      provider: "microsoft-excel",
      action: "read_range",
      config: {
        workbookId: "{{ledger.workbook.id}}",
        worksheetName: "Sheet1",
        address: "A2",
      },
      markerPath: "values",
      markerSuffix: "updated",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-onedrive",
      action: "delete_item",
      config: { itemId: "{{ledger.workbook.id}}" },
    },
  },
  notes:
    "SMOKE-WRITE-40 — upload minimal .xlsx (empty 'Sheet1') -> add_row header ['Col'] at A1 -> " +
    "add_row seed ['{{marker}}seed'] at A2 -> excel:update_row row 2 Col -> '{{marker}}updated' -> " +
    "independent excel:read_range A2 read-back confirms marker(+suffix updated) on the cell value " +
    "(the seed lacks 'updated', so a no-op fails) -> onedrive:delete_item removes the whole file " +
    "(recycle bin, recoverable). destructiveSafe. NOT live-certified yet (durable-queue enum blocker).",
});
