import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:add_table_row` — Slice 4.EXCEL-META-3.
 * Mirrors `addTableRow.schema.ts`. `values` is a `string-array` — one chip
 * per cell in the table's column order (the schema's positional-array
 * branch; the header-keyed record branch stays available to variable
 * wiring and API-authored configs). `tableName` → tables picker
 * (dependsOn workbookId). `valuesWritten` output carries cell data →
 * sensitive. CONFIG-UX-AUDIT-1 replaced the previous paste-JSON textarea,
 * which stored a literal string the runtime schema rejected.
 */
export const microsoftExcelAddTableRowMeta: ActionMeta = {
  key: "microsoft-excel:add_table_row",
  provider: "microsoft-excel",
  type: "add_table_row",
  displayName: "Add Table Row",
  description:
    "Append a row to an Excel table. Add one value per column in the table's column order; the row lands at the bottom of the table with a stable Graph-assigned row id.",
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
      name: "tableName",
      label: "Table",
      description: "The Excel table to append to. Pick a workbook first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:tables",
      dependsOn: "workbookId",
      placeholder: "Select workbook first",
    },
    {
      name: "values",
      label: "Row values",
      description:
        "Add one value per column, in the table's column order. The row is appended to the bottom of the table.",
      type: "string-array",
      required: true,
      placeholder: "Type a cell value and press Enter",
    },
  ],
  outputs: [
    { name: "rowIndex", type: "number", description: "Graph-assigned stable index of the appended table row." },
    { name: "columnCount", type: "number", description: "Number of columns written." },
    {
      name: "valuesWritten",
      type: "array",
      description: "The cell values written to the table row.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Appends a row to a table — recoverable external write.",
};
