import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:update_row` — Slice
 * 4.EXCEL-META-3, guided in SPREADSHEET-GUIDED-CONFIG-S3.
 *
 * Mirrors `updateRow.schema.ts`. `values` is a column-header → cell-value
 * map. It renders as the composite `spreadsheet-rows` editor in RECORD
 * mode (`valueShape: "record"`), backed by the real first-row headings of
 * the chosen worksheet (`microsoft-excel:worksheet_columns`), so an author
 * picks from their own columns instead of retyping heading text
 * character-for-character and finding out at run time that they got the
 * capitalisation wrong.
 *
 * Record mode is what this action's runtime schema requires: `values` is
 * `z.record(...)` with no positional branch at all, so an editor that
 * "preserved" an absent value as an array would author a config the schema
 * rejects. Declaring the shape here keeps that decision in metadata rather
 * than in a branch on this action's key inside a shared component.
 *
 * There is no `batchRowsField`: one call updates one row, and the contract
 * rejects a batch sibling on a record field for exactly that reason.
 *
 * Output echoes only column NAMES (no cell values) → not sensitive.
 */
export const microsoftExcelUpdateRowMeta: ActionMeta = {
  key: "microsoft-excel:update_row",
  provider: "microsoft-excel",
  type: "update_row",
  displayName: "Update Row",
  description:
    "Change specific columns in a row that already exists, leaving every other column as it is. Columns are addressed by their heading. Row numbers match what you see in Excel, and row 1 (the headings) can't be updated.",
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
      label: "Row number",
      // Says only what the builder can stand behind. It does NOT claim we
      // read the row's contents — nothing here fetches an arbitrary
      // worksheet row, and implying otherwise would make the step look
      // like it had checked something it never looked at.
      description:
        "The row number as it appears in Excel. Row 1 holds your column headings and can't be updated, so data normally starts at row 2. The row has to exist already — this step changes a row, it never adds one.",
      type: "number",
      required: true,
      numeric: { min: 2, integer: true },
    },
    {
      name: "values",
      label: "What should change",
      description:
        "Choose what happens to each column: leave it as it is, empty it, or set a new value. Columns you leave unchanged keep whatever is already in them.",
      type: "spreadsheet-rows",
      required: true,
      valueShape: "record",
      optionsSource: "microsoft-excel:worksheet_columns",
      dependsOn: ["workbookId", "worksheetName"],
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
