import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-sheets:get_sheet_metadata — read-only spreadsheet structure.
 *
 * Returns spreadsheet-level + per-sheet metadata (titles, sheetIds, row/column
 * counts) — NOT cell data (that's read_rows). The spreadsheet id comes from
 * SMOKE_GSHEETS_SPREADSHEET_ID (overlaid onto config). SKIPs without Sheets env.
 */
export default defineActionSmokeFixture({
  provider: "google-sheets",
  action: "get_sheet_metadata",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { spreadsheetId: "SMOKE_GSHEETS_SPREADSHEET_ID" },
  requiredEnv: ["SMOKE_GOOGLE_SHEETS_CONNECTED", "SMOKE_GSHEETS_SPREADSHEET_ID"],
  expect: { outcome: "success" },
  notes: "Read-only spreadsheet metadata; needs a connected Google Sheets + spreadsheet id.",
});
