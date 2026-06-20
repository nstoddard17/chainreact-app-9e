import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-excel:read_table_rows — read-only one-page table read.
 *
 * Reads up to 5 rows of SMOKE_EXCEL_TABLE_NAME in SMOKE_EXCEL_WORKBOOK_ID
 * (overlaid onto config), so it SKIPs before workflow creation until
 * provided. The action's `rows` output carries cell data (sensitive); the
 * smoke report stays status-only and never surfaces it.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-excel",
  action: "read_table_rows",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { top: 5 },
  configFromEnv: {
    workbookId: "SMOKE_EXCEL_WORKBOOK_ID",
    tableName: "SMOKE_EXCEL_TABLE_NAME",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_EXCEL_CONNECTED",
    "SMOKE_EXCEL_WORKBOOK_ID",
    "SMOKE_EXCEL_TABLE_NAME",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only Excel table read (one page, max 5); needs a connected Excel + workbook id + a table name in SMOKE_EXCEL_TABLE_NAME. Empty table is still a success.",
});
