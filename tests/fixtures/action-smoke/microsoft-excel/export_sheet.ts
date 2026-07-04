import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-excel:export_sheet — READ-ONLY used-range parse of the standing
 * smoke worksheet (the same SMOKE_EXCEL_WORKBOOK_ID / SMOKE_EXCEL_WORKSHEET_NAME
 * the certified Excel reads/writes use).
 *
 * Despite the "export" name this action performs NO file export — it returns
 * the parsed cell matrix (headers/rows/rowCount/columnCount/address) from
 * Graph's usedRange. No file output, so the file-output contract is trivially
 * honored (no bytes, no FileRef needed). An empty worksheet is still a success
 * (headers [] / rows []).
 */
export default defineActionSmokeFixture({
  provider: "microsoft-excel",
  action: "export_sheet",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: { hasHeaders: true },
  configFromEnv: {
    workbookId: "SMOKE_EXCEL_WORKBOOK_ID",
    worksheetName: "SMOKE_EXCEL_WORKSHEET_NAME",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_EXCEL_CONNECTED",
    "SMOKE_EXCEL_WORKBOOK_ID",
    "SMOKE_EXCEL_WORKSHEET_NAME",
  ],
  expect: { outcome: "success" },
  notes:
    "Read-only used-range parse of the standing smoke worksheet (headers/rows " +
    "matrix; no file output). Needs a connected Excel + workbook id + worksheet name.",
});
