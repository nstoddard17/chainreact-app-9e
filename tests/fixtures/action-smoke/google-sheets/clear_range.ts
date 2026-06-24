import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-sheets:clear_range (destructiveSafe, cleaned — CROSS-PROVIDER) — SMOKE-WRITE-28.
 *
 *   setup    create_spreadsheet -> create a WHOLE smoke-owned spreadsheet with a
 *            PINNED first-sheet name ("Data"). Capture { spreadsheetId } into ledger
 *            key "sheet".
 *            update_cell        -> SEED Data!A1 = "<marker>seed" (RAW) so the cell is
 *            NON-EMPTY before the clear. Without a seed, a cleared-cell read-back would
 *            pass vacuously on an already-empty sheet; seeding proves the clear took a
 *            populated cell to empty. (update_cell is itself certified — a setup write
 *            that returns ok did land the value.)
 *   execute  clear_range        -> clear "Data!A1" in OUR spreadsheet. The handler's
 *            `clearedRange` is a write echo (the range it asked to clear), never trusted
 *            as proof the cell is now blank.
 *   verify   get_cell_value     -> READ-BACK Data!A1 and assert the PERSISTED `value`
 *            is PRESENT-but-EMPTY via `expectEmpty` (get_cell_value returns
 *            `value: null` for a blank cell; the `value` key is always present, so a
 *            missing path can never vacuously pass). A still-set value -> VERIFY_FAILED;
 *            a permission/API error fails the read-back STEP before assertions run.
 *   cleanup  google-drive:delete_file (permanent) -> delete the WHOLE smoke spreadsheet
 *            (spreadsheetId IS a Drive file id; Sheets has no own delete). CROSS-PROVIDER,
 *            declared via `crossProviderCleanup: true`.
 *
 * Safety: seed + clear happen entirely inside a freshly-created smoke spreadsheet at a
 * FIXED cell, then the whole artifact is permanently deleted — never a pre-existing /
 * shared sheet. requiredEnv is only the connection signal.
 */
export default defineWriteSmokeFixture({
  provider: "google-sheets",
  action: "clear_range",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    spreadsheetId: "{{ledger.sheet.id}}",
    range: "Data!A1",
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
        // Seed A1 with a distinct value so the clear is provably a change (empty -> empty
        // would pass vacuously without this).
        provider: "google-sheets",
        action: "update_cell",
        config: {
          spreadsheetId: "{{ledger.sheet.id}}",
          sheetName: "Data",
          cell: "A1",
          value: "{{smokeMarker}}seed",
          valueInputOption: "RAW",
        },
      },
    ],
    verify: {
      provider: "google-sheets",
      action: "get_cell_value",
      config: { spreadsheetId: "{{ledger.sheet.id}}", sheetName: "Data", cell: "A1" },
      // Independent proof the cell is now blank: value present-and-empty (null).
      expectEmpty: { path: "value" },
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{ledger.sheet.id}}", permanent: true },
    },
  },
  notes:
    "SMOKE-WRITE-28 — create smoke spreadsheet (pinned 'Data') + seed A1=<marker>seed " +
    "-> clear_range Data!A1 -> get_cell_value A1 expectEmpty(value) (independent, null) " +
    "-> google-drive:delete_file (cross-provider, permanent). destructiveSafe.",
});
