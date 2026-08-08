import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-sheets:delete_row`.
 *
 * Mirrors `deleteRow.schema.ts`:
 *   - `spreadsheetId`  (required) — combobox from
 *                       the Google Picker.
 *   - `sheetName`      (required) — combobox from
 *                       `google-sheets:sheets`, gated on spreadsheetId.
 *                       Handler resolves sheetName → numeric sheetId via
 *                       `spreadsheets.get`.
 *   - `rowNumber`      (required) — 1-indexed positive integer. Matches
 *                       what users see in the Sheets UI (row 1 is the
 *                       first row, including any header row).
 *
 * Outputs are purely structural — `{spreadsheetId, sheetName, sheetId,
 * rowNumber, deleted}`. The deleted row's values are NOT echoed (the
 * delete is composed of get + batchUpdate; reading + returning the
 * row's values pre-delete is an avoidable extra read).
 *
 * Risk classification — `high` + `isDestructive: true` +
 * `requiresConfirmation: true`. Row deletion is irreversibly
 * destructive of caller data; subsequent rows shift up so chained
 * delete_row calls must run in descending row order to stay correct.
 */
export const googleSheetsDeleteRowMeta: ActionMeta = {
  key: "google-sheets:delete_row",
  provider: "google-sheets",
  type: "delete_row",
  displayName: "Delete Row",
  description:
    "**Destructive.** Delete a single row from a Google Sheet via `spreadsheets.batchUpdate` (`deleteDimension`). Subsequent rows shift up; chained delete_row calls MUST run in descending row order. Row content cannot be recovered from this action. `rowNumber` is 1-indexed (matches the Sheets UI). Requires typed confirmation before activation + real Run-now.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "spreadsheetId",
      label: "Spreadsheet",
      description:
        "Choose the Google Sheets file this step works with. Picking it here is also what grants ChainReact access to that one file.",
      type: "text",
      resourcePicker: "google-sheets:spreadsheet",
      required: true,
      placeholder: "Choose a spreadsheet, or paste its ID",
    },
    {
      name: "sheetName",
      label: "Sheet",
      description:
        "Pick a worksheet (tab) inside the chosen spreadsheet. Gated on Spreadsheet — change the spreadsheet and the sheet picker re-fetches.",
      type: "combobox",
      optionsSource: "google-sheets:sheets",
      dependsOn: "spreadsheetId",
      required: true,
      placeholder: "Select Spreadsheet first",
    },
    {
      name: "rowNumber",
      label: "Row number",
      description:
        "1-indexed row to delete — matches the Sheets UI. Row 1 is the first row (including a header row if there is one). Subsequent rows shift up after the delete.",
      type: "number",
      required: true,
      numeric: { min: 1, integer: true, step: 1 },
      placeholder: "5",
    },
  ],
  outputs: [
    {
      name: "spreadsheetId",
      type: "string",
      description: "Spreadsheet id the row was deleted from (echoed).",
    },
    {
      name: "sheetName",
      type: "string",
      description: "Sheet/tab title the row was deleted from (echoed).",
    },
    {
      name: "sheetId",
      type: "number",
      description:
        "Numeric Sheets API sheetId the handler resolved sheetName to via `spreadsheets.get`.",
    },
    {
      name: "rowNumber",
      type: "number",
      description: "1-indexed row number deleted (echoed).",
    },
    {
      name: "deleted",
      type: "boolean",
      description: "Always `true` on success — convenience scalar for branch-on-success.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 100,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Destructive — deletes the row and shifts subsequent rows up. Row content cannot be recovered from this action. Chained deletes MUST run in descending row order.",
};
