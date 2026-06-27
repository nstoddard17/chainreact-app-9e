import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";
import { MINIMAL_XLSX_BASE64 } from "@/tests/smoke-actions/minimalXlsx";

/**
 * microsoft-excel:create_worksheet (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-36.
 *
 * Excel has no `create_workbook` action, so the smoke brings its OWN smoke-owned
 * workbook: setup uploads a frozen minimal `.xlsx` (one `Sheet1`) to the OneDrive root
 * via the certified `microsoft-onedrive:upload_file` (inline base64), capturing the
 * drive-item id as the `workbookId`. The Excel action then adds a marker-NAMED worksheet
 * to THAT throwaway workbook, and the whole file is hard-deleted at the end. No
 * user/customer workbook is ever touched.
 *
 *   setup    onedrive:upload_file   -> upload the minimal workbook (marker FILENAME) to
 *            the drive root. Capture { itemId } into ledger key "workbook".
 *   execute  excel:create_worksheet -> add a worksheet named "{{marker}}ws" to the
 *            captured workbook. The handler's own echo is never trusted.
 *   verify   excel:get_worksheets   -> INDEPENDENT read-back of the workbook's worksheet
 *            list; confirm the marker(+suffix "ws") appears on a persisted worksheet name
 *            (the seeded "Sheet1" lacks the marker, so a no-op fails).
 *   cleanup  onedrive:delete_item   -> remove the WHOLE smoke workbook file (same OneDrive
 *            provider that created it — NOT cross-provider). A workbook-session lock right
 *            after the edit is absorbed by the bounded OneDrive delete retry.
 *
 * Verified-by-read-back, smoke-owned throughout, zero leaked. requiredEnv is the two
 * connection signals (Excel for the action under test; OneDrive for setup + cleanup).
 *
 * HONESTY — `microsoft-onedrive:delete_item` moves the file to the RECYCLE BIN
 * (recoverable), not a hard erase; the object is gone from the active drive
 * (get/list then 404s), so the harness reports artifact "cleaned" and the cert note
 * discloses the recycle-bin semantics (same disclosure as the OneDrive write certs).
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-excel",
  action: "create_worksheet",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    workbookId: "{{ledger.workbook.id}}",
    name: "{{smokeMarker}}ws",
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
      markerSuffix: "ws",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-onedrive",
      action: "delete_item",
      config: { itemId: "{{ledger.workbook.id}}" },
    },
  },
  notes:
    "SMOKE-WRITE-36 — upload a frozen minimal .xlsx via onedrive:upload_file (smoke-owned " +
    "workbook) -> excel:create_worksheet adds a '{{marker}}ws' sheet -> independent " +
    "excel:get_worksheets read-back confirms the marker(+suffix ws) on a worksheet name -> " +
    "onedrive:delete_item removes the whole file (recycle bin, recoverable). destructiveSafe.",
});
