import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:add_row` — Slice 4.EXCEL-META-3.
 *
 * Mirrors `addRow.schema.ts` (camelCase field names match the runtime Zod
 * schema 1:1). `values` (single positional row) XOR `rows` (batch,
 * header-keyed, 1..1000) — exactly one is required; the runtime `.refine`
 * is authoritative, so both are `required: false` here.
 *
 * SPREADSHEET-CONFIG-REDESIGN-1: `values` renders as the composite
 * `spreadsheet-rows` editor — a column-aware row editor whose column
 * names come from the sheet's REAL first-row headers
 * (`microsoft-excel:worksheet_columns` resolver). Its "One row" mode
 * commits `values` (positional, blanks preserved for alignment); its
 * "Several rows" mode commits the `rows` sibling (header-keyed records)
 * via `batchRowsField` — exactly one shape at a time. `rows` declares
 * `renderedBy: "values"` so it never renders a duplicate standalone
 * editor but stays a full citizen for the AI catalog + runtime schema.
 * Both save shapes are UNCHANGED from CONFIG-UX-AUDIT-1 (real
 * arrays/records, never JSON strings). Cell values entered visually are
 * strings; authors who need typed cells wire a `{{...}}` variable from
 * an upstream output.
 *
 * `workbookId` → workbooks picker; `worksheetName` → worksheets picker
 * (dependsOn workbookId); the row editor depends on BOTH (changing the
 * destination clears the row data — different sheets have different
 * columns). Cell-data outputs (`valuesWritten`, `rowsAdded`) are
 * flagged sensitive.
 */
export const microsoftExcelAddRowMeta: ActionMeta = {
  key: "microsoft-excel:add_row",
  provider: "microsoft-excel",
  type: "add_row",
  displayName: "Add Row",
  description:
    "Add one or more rows to the bottom of an Excel worksheet, filling in each column by name.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workbookId",
      label: "Workbook",
      description: "The Excel file from your OneDrive.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:workbooks",
      placeholder: "Search workbooks…",
    },
    {
      name: "worksheetName",
      label: "Worksheet",
      description: "The sheet (tab) the row should go to.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:worksheets",
      dependsOn: "workbookId",
      placeholder: "Select workbook first",
    },
    {
      name: "values",
      label: "Row values",
      description:
        "Add one value per column. Columns come from your selected worksheet; leave a field blank to keep that cell empty.",
      type: "spreadsheet-rows",
      required: false,
      optionsSource: "microsoft-excel:worksheet_columns",
      dependsOn: ["workbookId", "worksheetName"],
      batchRowsField: "rows",
    },
    {
      name: "rows",
      label: "Rows (add several at once)",
      description:
        "Add up to 1000 rows at once. Each row lists its values by column name.",
      type: "keyvalue-list",
      required: false,
      listMaxItems: 1000,
      dependsOn: ["workbookId", "worksheetName"],
      renderedBy: "values",
    },
  ],
  outputs: [
    { name: "workbookId", type: "string", description: "The workbook id written to." },
    { name: "worksheetName", type: "string", description: "The worksheet written to." },
    { name: "address", type: "string", description: "A1 range that was written." },
    { name: "columnCount", type: "number", description: "Number of columns written." },
    {
      name: "rowIndex",
      type: "number",
      description: "Single-row mode: 1-based index of the appended row.",
    },
    {
      name: "valuesWritten",
      type: "array",
      description: "Single-row mode: the cell values written.",
      sensitive: true,
    },
    { name: "rowCount", type: "number", description: "Batch mode: number of rows added." },
    {
      name: "rowsAdded",
      type: "array",
      description: "Batch mode: the rows written.",
      sensitive: true,
    },
    { name: "firstRowNumber", type: "number", description: "Batch mode: 1-based index of the first appended row." },
    { name: "lastRowNumber", type: "number", description: "Batch mode: 1-based index of the last appended row." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Appends data to a worksheet — recoverable external write.",
};
