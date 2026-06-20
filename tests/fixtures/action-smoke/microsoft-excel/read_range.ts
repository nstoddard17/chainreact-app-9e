import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-excel:read_range — read-only bounded A1 range read.
 *
 * Reads the SMOKE_EXCEL_RANGE address on SMOKE_EXCEL_WORKSHEET_NAME in
 * SMOKE_EXCEL_WORKBOOK_ID (all overlaid onto config), so it SKIPs before
 * workflow creation until provided. The action's `values` output carries
 * cell data (capped/sensitive); the smoke report stays status-only and never
 * surfaces it.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-excel",
  action: "read_range",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    workbookId: "SMOKE_EXCEL_WORKBOOK_ID",
    worksheetName: "SMOKE_EXCEL_WORKSHEET_NAME",
    address: "SMOKE_EXCEL_RANGE",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_EXCEL_CONNECTED",
    "SMOKE_EXCEL_WORKBOOK_ID",
    "SMOKE_EXCEL_WORKSHEET_NAME",
    "SMOKE_EXCEL_RANGE",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only Excel range read; needs a connected Excel + workbook id + worksheet name + a bounded A1 range (e.g. A1:D10) in SMOKE_EXCEL_RANGE.",
});
