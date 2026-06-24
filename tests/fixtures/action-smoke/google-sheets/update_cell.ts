import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-sheets:update_cell (destructiveSafe, cleaned — CROSS-PROVIDER) — SMOKE-WRITE-27.
 *
 *   setup    create_spreadsheet -> create a WHOLE smoke-owned spreadsheet with a
 *            PINNED first-sheet name ("Data") so the cell address is deterministic
 *            and never depends on Google's localized default. Capture
 *            { spreadsheetId } into ledger key "sheet" (a spreadsheetId IS a Drive
 *            file id).
 *   execute  update_cell        -> write a marker value to a FIXED cell (Data!A1) in
 *            OUR spreadsheet (RAW — the marker is stored literally, no formula
 *            parsing). The handler's `updated: true` is a hard-coded echo, never
 *            trusted.
 *   verify   get_cell_value     -> READ-BACK the SAME cell and confirm the marker on
 *            the PERSISTED `value` (markerSuffix "cell" -> requires "<marker>cell").
 *            Independent read (its `value` is the live cell, not the write echo).
 *   cleanup  google-drive:delete_file (permanent) -> delete the WHOLE smoke
 *            spreadsheet. Sheets has no own delete; the spreadsheetId is a Drive file
 *            id, so the certified Drive delete is the teardown. CROSS-PROVIDER cleanup,
 *            declared via `crossProviderCleanup: true`.
 *
 * Safety: every mutation is confined to a spreadsheet THIS run created, then the
 * entire artifact is permanently deleted — never a pre-existing/shared sheet, no
 * positional ambiguity. requiredEnv is only the connection signal.
 */
export default defineWriteSmokeFixture({
  provider: "google-sheets",
  action: "update_cell",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    spreadsheetId: "{{ledger.sheet.id}}",
    sheetName: "Data",
    cell: "A1",
    value: "{{smokeMarker}}cell",
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
      markerSuffix: "cell",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{ledger.sheet.id}}", permanent: true },
    },
  },
  notes:
    "SMOKE-WRITE-27 — create smoke spreadsheet (pinned sheet 'Data') -> update_cell " +
    "A1=<marker>cell (RAW) -> get_cell_value A1 read-back marker(+suffix cell) on value " +
    "-> google-drive:delete_file (cross-provider, permanent). destructiveSafe.",
});
