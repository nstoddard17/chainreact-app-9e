import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-sheets:format_range (destructiveSafe, cleaned — CROSS-PROVIDER) — SMOKE-WRITE-29.
 *
 *   setup    create_spreadsheet -> create a WHOLE smoke-owned spreadsheet (pinned
 *            first sheet "Data"). Capture { spreadsheetId } into ledger key "sheet".
 *            update_cell        -> write Data!A1=<marker>cell so the formatted cell is
 *            a real populated cell (a freshly-created cell carries NO bold format, so
 *            the read-back below proves the format actually landed — not a default).
 *   execute  format_range       -> apply a DETERMINISTIC, NON-DEFAULT format
 *            (bold: true) to Data!A1. The handler's `appliedFormat` output is a CONFIG
 *            ECHO, never trusted as proof.
 *   verify   cell_format        -> SMOKE-ONLY bounded read-back (no user-facing action
 *            reads cell format). Reads ONLY Data!A1's `userEnteredFormat` sub-fields via
 *            a tight `fields` mask (no cell values / payload), and asserts `bold == true`
 *            with `expectEquals`. A fresh cell reads `bold: null`, so this can only pass
 *            if format_range set bold. A permission/API error fails the read-back STEP
 *            (never read as formatted).
 *   cleanup  google-drive:delete_file (permanent) -> delete the WHOLE smoke spreadsheet
 *            (spreadsheetId IS a Drive file id). CROSS-PROVIDER, declared.
 *
 * Safety: seed + format happen entirely inside a freshly-created smoke spreadsheet at a
 * FIXED cell, then the whole artifact is permanently deleted — never a pre-existing /
 * shared sheet. requiredEnv is only the connection signal.
 */
export default defineWriteSmokeFixture({
  provider: "google-sheets",
  action: "format_range",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    spreadsheetId: "{{ledger.sheet.id}}",
    sheetName: "Data",
    // Bare A1 (no sheet prefix) per the format_range schema.
    range: "A1",
    bold: true,
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
          value: "{{smokeMarker}}cell",
          valueInputOption: "RAW",
        },
      },
    ],
    verify: {
      // Smoke-only bounded format read-back (range is sheet-prefixed for spreadsheets.get).
      provider: "google-sheets",
      action: "cell_format",
      smokeRead: true,
      config: { spreadsheetId: "{{ledger.sheet.id}}", range: "Data!A1" },
      // Independent proof: the cell's userEnteredFormat.textFormat.bold is now true.
      expectEquals: { path: "bold", value: true },
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{ledger.sheet.id}}", permanent: true },
    },
  },
  notes:
    "SMOKE-WRITE-29 — create smoke spreadsheet (pinned 'Data') + seed A1 -> format_range " +
    "A1 bold:true -> smoke cell_format read-back expectEquals(bold==true) (independent, " +
    "bounded, sanitized) -> google-drive:delete_file (cross-provider, permanent). destructiveSafe.",
});
