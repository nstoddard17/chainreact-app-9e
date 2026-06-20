import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-excel:find_row — read-only table lookup (first match).
 *
 * Scans up to 25 rows of SMOKE_EXCEL_TABLE_NAME for a row whose
 * SMOKE_EXCEL_LOOKUP_COLUMN equals SMOKE_EXCEL_LOOKUP_VALUE (all overlaid
 * onto config), so it SKIPs before workflow creation until provided. A
 * no-match returns found:false and is still a success; only a missing
 * lookup column errors. The smoke report stays status-only and never
 * surfaces matched cell data.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-excel",
  action: "find_row",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { maxRows: 25 },
  configFromEnv: {
    workbookId: "SMOKE_EXCEL_WORKBOOK_ID",
    tableName: "SMOKE_EXCEL_TABLE_NAME",
    lookupColumn: "SMOKE_EXCEL_LOOKUP_COLUMN",
    lookupValue: "SMOKE_EXCEL_LOOKUP_VALUE",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_EXCEL_CONNECTED",
    "SMOKE_EXCEL_WORKBOOK_ID",
    "SMOKE_EXCEL_TABLE_NAME",
    "SMOKE_EXCEL_LOOKUP_COLUMN",
    "SMOKE_EXCEL_LOOKUP_VALUE",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only Excel table lookup (first match, scans ≤25 rows); needs a connected Excel + workbook id + table name + an existing header in SMOKE_EXCEL_LOOKUP_COLUMN + a value in SMOKE_EXCEL_LOOKUP_VALUE. A no-match is still a success.",
});
