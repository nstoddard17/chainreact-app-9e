import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";
import { MINIMAL_XLSX_BASE64 } from "@/tests/smoke-actions/minimalXlsx";

/**
 * microsoft-excel:add_row (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-39.
 *
 * Reuses the SMOKE-WRITE-36 Excel bootstrap (smoke-owned uploaded workbook). The frozen
 * minimal `.xlsx` seeds exactly one EMPTY worksheet `Sheet1`, and `add_row`'s single-row
 * mode appends at A1 when the used range is empty — so no table and no header setup is
 * needed, and the appended row lands deterministically at A1:B1. No user/customer
 * workbook is ever touched.
 *
 *   setup    onedrive:upload_file -> upload the minimal workbook (marker FILENAME) to the
 *            drive root. Capture { itemId } into ledger key "workbook".
 *   execute  excel:add_row        -> append the positional row ["{{marker}}row", "x"] to
 *            the empty "Sheet1" (lands at A1:B1). The handler's updatedRange/echo is never
 *            trusted.
 *   verify   excel:read_range     -> INDEPENDENT read-back of A1 (where the marker cell
 *            landed); confirm the marker(+suffix "row") on the persisted cell value (an
 *            empty / un-appended sheet has no marker, so a no-op fails).
 *   cleanup  onedrive:delete_item -> remove the WHOLE smoke workbook file (same OneDrive
 *            provider that created it — NOT cross-provider). A workbook-session lock right
 *            after the edit is absorbed by the bounded OneDrive delete retry.
 *
 * Verified-by-read-back, smoke-owned throughout, zero leaked. requiredEnv is the two
 * connection signals (Excel for the action under test; OneDrive for setup + cleanup).
 *
 * HONESTY — `microsoft-onedrive:delete_item` moves the file to the RECYCLE BIN
 * (recoverable), not a hard erase; the object is gone from the active drive (get/list
 * then 404s), so the harness reports artifact "cleaned" and the cert note discloses the
 * recycle-bin semantics (same disclosure as the OneDrive write certs).
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-excel",
  action: "add_row",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    workbookId: "{{ledger.workbook.id}}",
    // The frozen minimal .xlsx seeds exactly one empty worksheet named "Sheet1".
    worksheetName: "Sheet1",
    // Single-row positional mode: empty used range -> appends at A1:B1.
    values: ["{{smokeMarker}}row", "x"],
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
    ],
    // Independent read-back: read_range A1 returns the appended marker cell value.
    verify: {
      provider: "microsoft-excel",
      action: "read_range",
      config: {
        workbookId: "{{ledger.workbook.id}}",
        worksheetName: "Sheet1",
        address: "A1",
      },
      markerPath: "values",
      markerSuffix: "row",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-onedrive",
      action: "delete_item",
      config: { itemId: "{{ledger.workbook.id}}" },
    },
  },
  notes:
    "SMOKE-WRITE-39 — upload a frozen minimal .xlsx via onedrive:upload_file (smoke-owned " +
    "workbook, empty 'Sheet1') -> excel:add_row appends ['{{marker}}row','x'] at A1:B1 -> " +
    "independent excel:read_range A1 read-back confirms the marker(+suffix row) on the cell " +
    "value -> onedrive:delete_item removes the whole file (recycle bin, recoverable). " +
    "destructiveSafe. NOT live-certified yet (durable-queue enum blocker).",
});
