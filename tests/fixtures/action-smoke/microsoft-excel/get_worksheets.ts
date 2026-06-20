import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-excel:get_worksheets — read-only worksheet list (metadata only).
 *
 * Lists the worksheets (name/id) of a single workbook. The workbook id comes
 * from SMOKE_EXCEL_WORKBOOK_ID (overlaid onto config), so it SKIPs before
 * workflow creation until provided. The report asserts only the terminal run
 * status — never worksheet names or cell content.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-excel",
  action: "get_worksheets",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: { workbookId: "SMOKE_EXCEL_WORKBOOK_ID" },
  requiredEnv: ["SMOKE_MICROSOFT_EXCEL_CONNECTED", "SMOKE_EXCEL_WORKBOOK_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only Excel worksheet list (metadata); needs a connected Excel + a workbook id in SMOKE_EXCEL_WORKBOOK_ID.",
});
