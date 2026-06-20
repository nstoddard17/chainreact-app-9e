import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-sheets:get_cell_value — read-only single-cell read (`spreadsheets.values.get`).
 *
 * Reads one cell. The handler composes the A1 range as `<sheetName>!<cell>`.
 * The spreadsheet id comes from SMOKE_GSHEETS_SPREADSHEET_ID and the sheet/tab
 * name from SMOKE_GSHEETS_SHEET_NAME (both overlaid onto config); `cell`
 * defaults to the always-safe top-left `A1`. A blank cell returns
 * `value: null` and is still a success. SKIPs before workflow creation without
 * the Sheets connection + ids.
 *
 * Read-only: the report asserts only the terminal run status, never the cell
 * value (the handler marks `value` sensitive).
 */
export default defineActionSmokeFixture({
  provider: "google-sheets",
  action: "get_cell_value",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { cell: "A1" },
  configFromEnv: {
    spreadsheetId: "SMOKE_GSHEETS_SPREADSHEET_ID",
    sheetName: "SMOKE_GSHEETS_SHEET_NAME",
  },
  requiredEnv: [
    "SMOKE_GOOGLE_SHEETS_CONNECTED",
    "SMOKE_GSHEETS_SPREADSHEET_ID",
    "SMOKE_GSHEETS_SHEET_NAME",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only single-cell read of A1; needs a connected Google Sheets + spreadsheet id + sheet/tab name in SMOKE_GSHEETS_SHEET_NAME. Blank A1 returns value:null and is still a success.",
});
