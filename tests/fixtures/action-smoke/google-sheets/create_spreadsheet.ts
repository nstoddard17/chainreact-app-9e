import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — google-sheets:create_spreadsheet (destructiveSafe, cleaned — CROSS-PROVIDER).
 *
 *   execute  create_spreadsheet -> create a WHOLE marker-titled spreadsheet; capture
 *            { spreadsheetId } into ledger key "sheet". A Sheet IS a Drive file, so
 *            spreadsheetId is a Drive file id.
 *   verify   get_sheet_metadata -> READ-BACK by id and confirm the marker on the
 *            PERSISTED spreadsheet `title`. create_spreadsheet's own `title` output
 *            falls back to config (input echo), so the read-back is independent.
 *   cleanup  google-drive:delete_file (permanent) -> remove exactly the ledger sheet.
 *            Google Sheets has NO own delete action; its spreadsheetId is a Drive
 *            file id, so the certified Drive delete is the correct teardown. This is
 *            a CROSS-PROVIDER cleanup, declared via `crossProviderCleanup: true`.
 *
 * Creating a WHOLE smoke-owned spreadsheet (not mutating a shared sheet, no
 * positional rows) is what makes this safe — the entire artifact is ours and is
 * deleted in full. Smoke-owned throughout; requiredEnv is only the connection
 * signal. Drive delete with permanent:true is a TRUE erase -> LIVE_PASS_CLEANED.
 */
export default defineWriteSmokeFixture({
  provider: "google-sheets",
  action: "create_spreadsheet",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    title: "{{smokeMarker}}sheet",
  },
  requiredEnv: ["SMOKE_GOOGLE_SHEETS_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    crossProviderCleanup: true,
    captureResource: { resourceKey: "sheet", idPath: "spreadsheetId", kind: "spreadsheet" },
    // Independent read-back: get_sheet_metadata returns the persisted spreadsheet title.
    verify: {
      provider: "google-sheets",
      action: "get_sheet_metadata",
      config: { spreadsheetId: "{{ledger.sheet.id}}" },
      markerPath: "title",
    },
    // Cross-provider teardown: a spreadsheet's spreadsheetId is a Drive file id.
    cleanupKind: "delete",
    cleanup: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{ledger.sheet.id}}", permanent: true },
    },
  },
  notes:
    "PILOT — create whole spreadsheet (marker title) -> get_sheet_metadata read-back " +
    "marker on title -> google-drive:delete_file (cross-provider, permanent). " +
    "spreadsheetId IS a Drive file id. destructiveSafe.",
});
