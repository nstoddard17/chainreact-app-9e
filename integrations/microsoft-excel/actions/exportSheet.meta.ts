import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:export_sheet` — Slice 4.EXCEL-META-3.
 * Mirrors `exportSheet.schema.ts`. Read action (low risk). `hasHeaders`
 * defaults to true (UI defaultValue hint; runtime schema is authoritative).
 * The `rows` output carries cell data → marked sensitive; `headers` are
 * column names (not sensitive).
 */
export const microsoftExcelExportSheetMeta: ActionMeta = {
  key: "microsoft-excel:export_sheet",
  provider: "microsoft-excel",
  type: "export_sheet",
  displayName: "Export Sheet",
  description:
    "Read a worksheet's used range. With Has Headers on, row 1 becomes header labels and rows are returned as header-keyed objects; off, rows are returned as positional arrays. Optionally cap the number of data rows.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workbookId",
      label: "Workbook",
      description: "The Excel workbook (file) from your OneDrive.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:workbooks",
      placeholder: "Search workbooks…",
    },
    {
      name: "worksheetName",
      label: "Worksheet",
      description: "The worksheet (tab) to read. Pick a workbook first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:worksheets",
      dependsOn: "workbookId",
      placeholder: "Select workbook first",
    },
    {
      name: "hasHeaders",
      label: "Has Headers",
      description:
        "When on, row 1 is treated as headers and rows are returned as header-keyed objects. Defaults to on.",
      type: "boolean",
      required: false,
      defaultValue: true,
    },
    {
      name: "limit",
      label: "Row Limit",
      description: "Optional cap on returned data rows (1–10000).",
      type: "number",
      required: false,
      numeric: { min: 1, max: 10000, integer: true },
    },
  ],
  outputs: [
    {
      name: "headers",
      type: "array",
      description: "Column header labels (null when Has Headers is off). Column names only.",
    },
    {
      name: "rows",
      type: "array",
      description:
        "The worksheet rows — header-keyed objects, or positional arrays when Has Headers is off. Contains spreadsheet cell data.",
      sensitive: true,
    },
    { name: "rowCount", type: "number", description: "Number of data rows returned." },
    { name: "columnCount", type: "number", description: "Number of columns in the range." },
    { name: "address", type: "string", description: "A1 range read." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Read-only — returns worksheet contents.",
};
