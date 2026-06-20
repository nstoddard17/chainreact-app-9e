import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-excel:get_workbooks — read-only workbook list (metadata only).
 *
 * Lists `.xlsx` workbooks under the user's drive root, bounded to a small
 * page. Needs only a connected Excel account; no selectors. The report
 * asserts only the terminal run status — never workbook names or ids. No
 * cell content.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-excel",
  action: "get_workbooks",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { top: 5 },
  requiredEnv: ["SMOKE_MICROSOFT_EXCEL_CONNECTED"],
  expect: { outcome: "success" },
  notes: "Read-only Excel workbook list (metadata, one page max 5); needs only SMOKE_MICROSOFT_EXCEL_CONNECTED.",
});
