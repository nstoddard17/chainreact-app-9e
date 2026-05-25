import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:add_table_row` — Slice 4.EXCEL-META-3.
 * Mirrors `addTableRow.schema.ts`. `values` is a positional array OR a
 * header-keyed object → paste-JSON textarea. `tableName` → tables picker
 * (dependsOn workbookId). `valuesWritten` output carries cell data →
 * sensitive.
 */
export const microsoftExcelAddTableRowMeta: ActionMeta = {
  key: "microsoft-excel:add_table_row",
  provider: "microsoft-excel",
  type: "add_table_row",
  displayName: "Add Table Row",
  description:
    "Append a row to an Excel table. Provide values as a positional array (table column order) or a header-keyed object. Graph aligns header-keyed values to the table's column order.",
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
      label: "Values (paste JSON)",
      description:
        'Row to append. Positional array (`["Ada","ada@x.com"]`) OR header-keyed object (`{"Name":"Ada","Email":"ada@x.com"}`).',
      type: "textarea",
      required: true,
      placeholder: '{"Name":"Ada","Email":"ada@example.com"}',
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
