import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";
import { MINIMAL_XLSX_BASE64 } from "@/tests/smoke-actions/minimalXlsx";

/**
 * microsoft-excel:delete_worksheet (destructiveSafe, cleaned — hard delete) — SMOKE-WRITE-38.
 *
 * Reuses the SMOKE-WRITE-36 Excel bootstrap (smoke-owned uploaded workbook). The frozen
 * minimal `.xlsx` seeds exactly one worksheet `Sheet1`; Graph rejects deleting the LAST
 * visible worksheet (HTTP 400), so setup first ADDS a second, marker-named worksheet
 * ("{{marker}}victim") and the action under test deletes THAT one — leaving `Sheet1`
 * behind so the workbook stays valid. No user/customer workbook is ever touched.
 *
 *   setup#1  onedrive:upload_file    -> upload the minimal workbook (marker FILENAME) to
 *            the drive root. Capture { itemId } into ledger key "workbook".
 *   setup#2  excel:create_worksheet  -> add the throwaway "{{marker}}victim" sheet (so the
 *            workbook has 2 sheets and the delete is safe).
 *   execute  excel:delete_worksheet  -> delete "{{marker}}victim". The handler's
 *            deleted echo is never trusted.
 *   verify   excel:get_worksheets    -> INDEPENDENT read-back proving (a) the deleted
 *            "{{marker}}victim" is ABSENT (expectAbsent on `worksheets`) AND (b) exactly
 *            one worksheet remains (expectEquals count == 1 — i.e. the seeded `Sheet1`
 *            survived and the workbook is still valid).
 *   cleanup  onedrive:delete_item    -> remove the WHOLE smoke workbook file (same OneDrive
 *            provider that created it — NOT cross-provider). A workbook-session lock right
 *            after the edits is absorbed by the bounded OneDrive delete retry.
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
  action: "delete_worksheet",
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    workbookId: "{{ledger.workbook.id}}",
    worksheetName: "{{smokeMarker}}victim",
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
        // Add the throwaway victim so there are 2 worksheets (delete-last-sheet is a 400).
        provider: "microsoft-excel",
        action: "create_worksheet",
        config: { workbookId: "{{ledger.workbook.id}}", name: "{{smokeMarker}}victim" },
      },
    ],
    // Independent read-back: the deleted victim is ABSENT and exactly one sheet (Sheet1) remains.
    verify: {
      provider: "microsoft-excel",
      action: "get_worksheets",
      config: { workbookId: "{{ledger.workbook.id}}" },
      expectAbsent: { path: "worksheets", value: "{{smokeMarker}}victim" },
      expectEquals: { path: "count", value: 1 },
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "microsoft-onedrive",
      action: "delete_item",
      config: { itemId: "{{ledger.workbook.id}}" },
    },
  },
  notes:
    "SMOKE-WRITE-38 — upload a frozen minimal .xlsx via onedrive:upload_file (smoke-owned " +
    "workbook, seeded 'Sheet1') -> create_worksheet adds '{{marker}}victim' (2 sheets) -> " +
    "excel:delete_worksheet deletes '{{marker}}victim' -> independent excel:get_worksheets " +
    "read-back: victim ABSENT + count==1 (Sheet1 survived) -> onedrive:delete_item removes " +
    "the whole file (recycle bin, recoverable). destructiveSafe.",
});
