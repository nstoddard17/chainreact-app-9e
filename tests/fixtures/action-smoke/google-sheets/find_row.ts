import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-sheets:find_row — read-only header-column row lookup.
 *
 * Reads the whole sheet (`spreadsheets.values.get`) and scans client-side for
 * rows whose `column` (a HEADER NAME, row 0) equals `value`. Read-only.
 * `operator` is the only Batch-1 value (`equals`); `returnAll` is off so the
 * scan stops at the first match. The spreadsheet id, sheet/tab name, search
 * column, and search value all come from env (overlaid onto config) so nothing
 * is hardcoded. SKIPs before workflow creation without the Sheets connection +
 * ids + lookup column/value.
 *
 * A miss (no matching row) returns `found: false` and is still a success; only
 * a missing column HEADER throws. The report asserts only the terminal run
 * status, never the matched row content (the handler marks `firstMatch` /
 * `matches` sensitive).
 */
export default defineActionSmokeFixture({
  provider: "google-sheets",
  action: "find_row",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { operator: "equals", returnAll: false },
  configFromEnv: {
    spreadsheetId: "SMOKE_GSHEETS_SPREADSHEET_ID",
    sheetName: "SMOKE_GSHEETS_SHEET_NAME",
    column: "SMOKE_GSHEETS_LOOKUP_COLUMN",
    value: "SMOKE_GSHEETS_LOOKUP_VALUE",
  },
  requiredEnv: [
    "SMOKE_GOOGLE_SHEETS_CONNECTED",
    "SMOKE_GSHEETS_SPREADSHEET_ID",
    "SMOKE_GSHEETS_SHEET_NAME",
    "SMOKE_GSHEETS_LOOKUP_COLUMN",
    "SMOKE_GSHEETS_LOOKUP_VALUE",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only header-column row lookup; needs a connected Google Sheets + spreadsheet id + sheet name + an existing header in SMOKE_GSHEETS_LOOKUP_COLUMN + a search value in SMOKE_GSHEETS_LOOKUP_VALUE. A no-match is still a success; only a missing header column fails.",
});
