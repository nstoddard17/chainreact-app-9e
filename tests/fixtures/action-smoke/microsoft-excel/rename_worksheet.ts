import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";
import { MINIMAL_XLSX_BASE64 } from "@/tests/smoke-actions/minimalXlsx";

/**
 * microsoft-excel:rename_worksheet (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-37.
 *
 * Reuses the SMOKE-WRITE-36 Excel bootstrap: the smoke brings its OWN smoke-owned
 * workbook (no create_workbook action exists). The frozen minimal `.xlsx` seeds exactly
 * one worksheet named `Sheet1`, so the action under test renames THAT seeded sheet to a
 * marker name — and because `Sheet1` carries no marker, only a successful rename can
 * produce a worksheet whose name contains the marker (a silent no-op leaves `Sheet1` and
 * fails the read-back). No user/customer workbook is ever touched.
 *
 *   setup    onedrive:upload_file   -> upload the minimal workbook (marker FILENAME) to
 *            the drive root. Capture { itemId } into ledger key "workbook".
 *   execute  excel:rename_worksheet -> rename the seeded "Sheet1" to "{{marker}}renamed".
 *            The handler's renamed/echo output is never trusted.
 *   verify   excel:get_worksheets   -> INDEPENDENT read-back of the workbook's worksheet
 *            list; confirm the marker(+suffix "renamed") appears on a persisted worksheet
 *            name (proves the rename landed; the pre-rename "Sheet1" lacks the marker).
 *   cleanup  onedrive:delete_item   -> remove the WHOLE smoke workbook file (same OneDrive
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
  action: "rename_worksheet",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    workbookId: "{{ledger.workbook.id}}",
    // The frozen minimal .xlsx seeds exactly one worksheet named "Sheet1".
    worksheetName: "Sheet1",
    newWorksheetName: "{{smokeMarker}}renamed",
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
    // Independent read-back: get_worksheets returns the persisted worksheet names.
    verify: {
      provider: "microsoft-excel",
      action: "get_worksheets",
      config: { workbookId: "{{ledger.workbook.id}}" },
      markerPath: "worksheets",
      markerSuffix: "renamed",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-onedrive",
      action: "delete_item",
      config: { itemId: "{{ledger.workbook.id}}" },
    },
  },
  notes:
    "SMOKE-WRITE-37 — upload a frozen minimal .xlsx via onedrive:upload_file (smoke-owned " +
    "workbook, seeded 'Sheet1') -> excel:rename_worksheet renames 'Sheet1' to " +
    "'{{marker}}renamed' -> independent excel:get_worksheets read-back confirms the " +
    "marker(+suffix renamed) on a worksheet name -> onedrive:delete_item removes the whole " +
    "file (recycle bin, recoverable). destructiveSafe.",
});
