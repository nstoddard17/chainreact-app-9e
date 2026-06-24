import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-sheets:append_row (destructiveSafe, cleaned — CROSS-PROVIDER) — SMOKE-WRITE-27.
 *
 *   setup    create_spreadsheet -> create a WHOLE smoke-owned spreadsheet with a
 *            PINNED first-sheet name ("Data"). Capture { spreadsheetId } into ledger
 *            key "sheet". The sheet starts EMPTY, so an append lands deterministically
 *            at row 1 (no positional ambiguity, no shared-sheet contention).
 *   execute  append_row         -> append one marker row to OUR empty sheet
 *            ("Data!A:Z", RAW). The handler's `updatedRange`/counts are write echoes,
 *            never trusted.
 *   verify   get_cell_value     -> READ-BACK Data!A1 (where the row landed) and confirm
 *            the marker on the PERSISTED `value` (markerSuffix "row" -> "<marker>row").
 *            Independent read of the live cell.
 *   cleanup  google-drive:delete_file (permanent) -> delete the WHOLE smoke spreadsheet
 *            (spreadsheetId IS a Drive file id). CROSS-PROVIDER, declared.
 *
 * Safety: append targets a freshly-created EMPTY smoke spreadsheet (row 1 is
 * deterministic), then the whole artifact is permanently deleted. requiredEnv is
 * only the connection signal.
 */
export default defineWriteSmokeFixture({
  provider: "google-sheets",
  action: "append_row",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    spreadsheetId: "{{ledger.sheet.id}}",
    range: "Data!A:Z",
    values: ["{{smokeMarker}}row", "x"],
    valueInputOption: "RAW",
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
    ],
    verify: {
      provider: "google-sheets",
      action: "get_cell_value",
      config: { spreadsheetId: "{{ledger.sheet.id}}", sheetName: "Data", cell: "A1" },
      markerPath: "value",
      markerSuffix: "row",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{ledger.sheet.id}}", permanent: true },
    },
  },
  notes:
    "SMOKE-WRITE-27 — create smoke spreadsheet (pinned 'Data') -> append_row " +
    "[<marker>row, x] to empty sheet (lands at row 1, RAW) -> get_cell_value A1 " +
    "read-back marker(+suffix row) on value -> google-drive:delete_file " +
    "(cross-provider, permanent). destructiveSafe.",
});
