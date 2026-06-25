import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-sheets:delete_row (destructiveSafe, cleaned — CROSS-PROVIDER) — SMOKE-WRITE-31.
 *
 * delete_row removes a row by POSITION (sheetName + 1-indexed rowNumber -> a
 * `deleteDimension` over `[rowNumber-1, rowNumber)`). Positional deletion is only
 * ambiguous on a SHARED sheet; inside a SAME-RUN spreadsheet WE own and seed, the row
 * positions are fully deterministic, so the delete + the row SHIFT it causes are
 * independently provable.
 *
 *   setup    create_spreadsheet -> WHOLE smoke spreadsheet (pinned first sheet "Data",
 *            starts EMPTY). Capture { spreadsheetId } into ledger key "sheet".
 *            update_cell x3     -> seed three KNOWN rows with unique markers:
 *              A1 = <marker>keep-before   (row 1)
 *              A2 = <marker>delete-me     (row 2 — the target)
 *              A3 = <marker>keep-after    (row 3)
 *   execute  delete_row         -> delete row 2 of "Data". Sheets shifts rows below the
 *            deleted row UP by one, so afterwards: A1 unchanged, A2 == the old A3 value,
 *            A3 blank. The handler's `deleted: true` is a hard-coded echo, never trusted.
 *   verify   verifyAll (3 INDEPENDENT get_cell_value reads — together they pin EXACTLY
 *            which row was removed; no single cell could):
 *              A1 -> value == <marker>keep-before  (row 1 was NOT the deleted row)
 *              A2 -> value == <marker>keep-after   (row 3 SHIFTED UP into row 2 -> row 2
 *                                                   was deleted; delete-me is gone)
 *              A3 -> value present-and-EMPTY        (the sheet shrank from 3 data rows to 2)
 *   cleanup  google-drive:delete_file (permanent) -> delete the WHOLE smoke spreadsheet
 *            (spreadsheetId IS a Drive file id; Sheets has no own delete). CROSS-PROVIDER,
 *            declared via `crossProviderCleanup: true`.
 *
 * The three facts are mutually constraining: the ONLY single-row deletion consistent
 * with (A1 kept, A2 == old A3, A3 empty) is "row 2 deleted". Independent live reads,
 * no echo. requiredEnv is only the connection signal.
 */
export default defineWriteSmokeFixture({
  provider: "google-sheets",
  action: "delete_row",
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    spreadsheetId: "{{ledger.sheet.id}}",
    sheetName: "Data",
    rowNumber: 2,
  },
  requiredEnv: ["SMOKE_GOOGLE_SHEETS_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    crossProviderCleanup: true,
    setup: [
      {
        provider: "google-sheets",
        action: "create_spreadsheet",
        config: { title: "{{smokeMarker}}sheet", initialSheetName: "Data" },
        captureResource: { resourceKey: "sheet", idPath: "spreadsheetId", kind: "spreadsheet" },
      },
      {
        provider: "google-sheets",
        action: "update_cell",
        config: {
          spreadsheetId: "{{ledger.sheet.id}}",
          sheetName: "Data",
          cell: "A1",
          value: "{{smokeMarker}}keep-before",
          valueInputOption: "RAW",
        },
      },
      {
        provider: "google-sheets",
        action: "update_cell",
        config: {
          spreadsheetId: "{{ledger.sheet.id}}",
          sheetName: "Data",
          cell: "A2",
          value: "{{smokeMarker}}delete-me",
          valueInputOption: "RAW",
        },
      },
      {
        provider: "google-sheets",
        action: "update_cell",
        config: {
          spreadsheetId: "{{ledger.sheet.id}}",
          sheetName: "Data",
          cell: "A3",
          value: "{{smokeMarker}}keep-after",
          valueInputOption: "RAW",
        },
      },
    ],
    // Three INDEPENDENT bounded reads that together prove row 2 (and only row 2) was deleted.
    verifyAll: [
      {
        provider: "google-sheets",
        action: "get_cell_value",
        config: { spreadsheetId: "{{ledger.sheet.id}}", sheetName: "Data", cell: "A1" },
        markerPath: "value",
        markerSuffix: "keep-before",
      },
      {
        provider: "google-sheets",
        action: "get_cell_value",
        config: { spreadsheetId: "{{ledger.sheet.id}}", sheetName: "Data", cell: "A2" },
        markerPath: "value",
        markerSuffix: "keep-after",
      },
      {
        provider: "google-sheets",
        action: "get_cell_value",
        config: { spreadsheetId: "{{ledger.sheet.id}}", sheetName: "Data", cell: "A3" },
        expectEmpty: { path: "value" },
      },
    ],
    cleanupKind: "delete",
    cleanup: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{ledger.sheet.id}}", permanent: true },
    },
  },
  notes:
    "SMOKE-WRITE-31 — create smoke spreadsheet (pinned 'Data') + seed A1/A2/A3 markers " +
    "-> delete_row row 2 -> verifyAll: A1==keep-before, A2==keep-after (shifted up), A3 empty " +
    "(pins row 2 deleted) -> google-drive:delete_file (cross-provider, permanent). destructiveSafe.",
});
