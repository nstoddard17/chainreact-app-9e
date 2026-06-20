import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-sheets:read_rows — read-only range read (`spreadsheets.values.get`).
 *
 * Reads cell values from an A1-notation range. The spreadsheet id comes from
 * SMOKE_GSHEETS_SPREADSHEET_ID and the range from SMOKE_GSHEETS_RANGE (both
 * overlaid onto config) so nothing is hardcoded — point them at a dedicated
 * smoke spreadsheet. `majorDimension` is left at the schema default (ROWS).
 * SKIPs before workflow creation without the Sheets connection + ids.
 *
 * Read-only: the report asserts only the terminal run status, never the cell
 * values (the handler marks `values` sensitive).
 */
export default defineActionSmokeFixture({
  provider: "google-sheets",
  action: "read_rows",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    spreadsheetId: "SMOKE_GSHEETS_SPREADSHEET_ID",
    range: "SMOKE_GSHEETS_RANGE",
  },
  requiredEnv: [
    "SMOKE_GOOGLE_SHEETS_CONNECTED",
    "SMOKE_GSHEETS_SPREADSHEET_ID",
    "SMOKE_GSHEETS_RANGE",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only range read; needs a connected Google Sheets + spreadsheet id + an A1 range (e.g. Sheet1!A1:D5) in SMOKE_GSHEETS_RANGE. Empty range is still a success.",
});
