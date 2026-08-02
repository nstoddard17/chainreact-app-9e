import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:add_table_row`.
 *
 * EXCEL-GUIDED-CONFIG-2 replaced the blind positional chip list with the
 * shared column-aware editor. The Excel table's own columns are the
 * authoritative destination schema — better than the row-1 heuristic a
 * worksheet needs — and `microsoft-excel:table_columns` already existed
 * (built for `find_row.lookupColumn`) but had never been wired here.
 *
 * BOTH saved representations stay valid and are round-tripped unchanged
 * (see `addTableRow.schema.ts`):
 *   - a POSITIONAL array, written verbatim by the handler, and
 *   - a record KEYED BY COLUMN NAME, which the handler aligns by name.
 * The editor never converts one into the other: the handler treats them
 * differently, so a conversion could change which column a value lands
 * in. New configurations keep the positional default this action has
 * always used.
 *
 * `tableName` → tables picker (dependsOn workbookId). `valuesWritten`
 * output carries cell data → sensitive.
 */
export const microsoftExcelAddTableRowMeta: ActionMeta = {
  key: "microsoft-excel:add_table_row",
  provider: "microsoft-excel",
  type: "add_table_row",
  displayName: "Add Table Row",
  description:
    "Add a new row to an Excel table, filling in each column by name. The row lands at the bottom of the table with a stable row id.",
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
        "What goes in each column of the new row. Columns come from the table you picked. Leave a column blank to keep that cell empty.",
      type: "spreadsheet-rows",
      required: true,
      optionsSource: "microsoft-excel:table_columns",
      dependsOn: ["workbookId", "tableName"],
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
