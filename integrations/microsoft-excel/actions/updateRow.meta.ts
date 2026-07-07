import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:update_row` — Slice 4.EXCEL-META-3.
 * Mirrors `updateRow.schema.ts`. `values` is a column-header → cell-value
 * map (keyvalue field). The handler resolves header names to columns at
 * execute time; column headers are typed (the `columns` resolver is
 * deferred). Output echoes only column NAMES (no cell values) → not
 * sensitive.
 */
export const microsoftExcelUpdateRowMeta: ActionMeta = {
  key: "microsoft-excel:update_row",
  provider: "microsoft-excel",
  type: "update_row",
  displayName: "Update Row",
  description:
    "Update specific cells in a known row, addressing columns by header name. Existing untouched cells are preserved. The supplied row number is 1-based.",
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
      description: "The worksheet (tab) to update. Pick a workbook first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:worksheets",
      dependsOn: "workbookId",
      placeholder: "Select workbook first",
    },
    {
      name: "rowNumber",
      label: "Row Number",
      description: "1-based row number to update.",
      type: "number",
      required: true,
      numeric: { min: 1, integer: true },
    },
    {
      name: "values",
      label: "Values (column → value)",
      description:
        "Column-header → cell-value pairs. At least one entry. Header names must match the worksheet's header row.",
      type: "keyvalue",
      required: true,
      keyValueShape: "record",
    },
  ],
  outputs: [
    { name: "workbookId", type: "string", description: "The workbook id updated." },
    { name: "worksheetName", type: "string", description: "The worksheet updated." },
    { name: "rowNumber", type: "number", description: "The 1-based row updated." },
    { name: "address", type: "string", description: "A1 range that was written." },
    { name: "columnsUpdated", type: "number", description: "Count of columns updated." },
    {
      name: "updatedColumns",
      type: "array",
      description: "Header names of the columns updated (names only — no cell values).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Overwrites cells in an existing row — may alter business data; recoverable.",
};
