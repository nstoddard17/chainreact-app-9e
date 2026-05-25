import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:add_row` — Slice 4.EXCEL-META-3.
 *
 * Mirrors `addRow.schema.ts` (camelCase field names match the runtime Zod
 * schema 1:1). `values` (single positional row) XOR `rows` (batch,
 * header-keyed, 1..1000) — exactly one is required; the runtime `.refine`
 * is authoritative, so both are `required: false` here and the rule is
 * documented in the field descriptions. Array/object shapes ship as
 * paste-JSON textareas (no structured array editor exists).
 *
 * `workbookId` → workbooks picker; `worksheetName` → worksheets picker
 * (dependsOn workbookId). Cell-data outputs (`valuesWritten`, `rowsAdded`)
 * are flagged sensitive.
 */
export const microsoftExcelAddRowMeta: ActionMeta = {
  key: "microsoft-excel:add_row",
  provider: "microsoft-excel",
  type: "add_row",
  displayName: "Add Row",
  description:
    "Append a row (or batch of rows) to a worksheet. Provide EITHER `values` (a single positional row aligned to the worksheet's column order) OR `rows` (a batch of header-keyed row objects, up to 1000) — exactly one.",
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
      description: "The worksheet (tab) to append to. Pick a workbook first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:worksheets",
      dependsOn: "workbookId",
      placeholder: "Select workbook first",
    },
    {
      name: "values",
      label: "Values — single row (paste JSON)",
      description:
        'Single-row mode. JSON array of cell values in column order, e.g. `["Ada","ada@x.com",42]`. Provide EITHER this OR Rows, not both.',
      type: "textarea",
      required: false,
      placeholder: '["Ada","ada@example.com",42]',
    },
    {
      name: "rows",
      label: "Rows — batch (paste JSON)",
      description:
        'Batch mode (max 1000). JSON array of header-keyed row objects, e.g. `[{"Name":"Ada","Email":"ada@x.com"}]`. Provide EITHER this OR Values, not both.',
      type: "textarea",
      required: false,
      placeholder: '[{"Name":"Ada","Email":"ada@example.com"}]',
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
