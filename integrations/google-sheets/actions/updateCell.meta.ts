import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-sheets:update_cell`.
 *
 * Mirrors `updateCell.schema.ts`:
 *   - `spreadsheetId`     (required) — combobox from
 *                          `google-sheets:spreadsheets`.
 *   - `sheetName`         (required) — combobox from
 *                          `google-sheets:sheets`, gated on
 *                          spreadsheetId. The handler builds the A1
 *                          range as `<sheetName>!<cell>`.
 *   - `cell`              (required) — strict A1 single-cell reference.
 *                          Ranges / full columns / full rows are
 *                          rejected at parse time; use `update_row` for
 *                          rectangles.
 *   - `value`             (required) — string / number / boolean / null
 *                          (null blanks the cell). UI stores text;
 *                          runtime accepts the union per schema.
 *   - `valueInputOption`  (required, Q11) — RAW vs USER_ENTERED.
 *                          V1 silently defaulted to USER_ENTERED in
 *                          updateCell which surprised users with formula
 *                          content; V2 forces the choice.
 *
 * Outputs match `updateCell.ts:return` — `{spreadsheetId, sheetName,
 * cell, updated, updatedRange, updatedCells}`. Purely structural.
 */
export const googleSheetsUpdateCellMeta: ActionMeta = {
  key: "google-sheets:update_cell",
  provider: "google-sheets",
  type: "update_cell",
  displayName: "Update Cell",
  description:
    "Update a single cell value. Specify sheet + cell separately (`Sheet1` + `B5`). Value can be a string, number, boolean, or `null` (blanks the cell). Required choice: parse the value as if typed in Sheets, or store it exactly as written.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "spreadsheetId",
      label: "Spreadsheet",
      description:
        "Pick a Google Sheets file from your connected account. The picker lists files most-recently-modified first.",
      type: "combobox",
      optionsSource: "google-sheets:spreadsheets",
      required: true,
      placeholder: "Search spreadsheets…",
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
      name: "cell",
      label: "Cell",
      description:
        "A1-style single-cell reference (`A1`, `B5`, `AA10`). Ranges (`A1:B5`), full columns (`A:A`), and full rows (`1:1`) are rejected at runtime — use Update Row for rectangles.",
      type: "text",
      required: true,
      placeholder: "A1",
    },
    {
      name: "value",
      label: "Value",
      description:
        "Cell value. Strings, numbers, booleans, or `null` (blanks the cell). The form stores text; runtime accepts the typed union per schema.",
      type: "text",
      required: true,
      placeholder: "alice@example.com",
    },
    {
      name: "valueInputOption",
      label: "Value input option",
      description:
        "How Sheets treats your value. Required — 'parse as typed' makes =SUM(...), dates and numbers live; 'store exactly' keeps them as text.",
      type: "select",
      required: true,
      options: [
        {
          value: "USER_ENTERED",
          label: "Parse as if typed in Sheets",
          description: "Formulas evaluate, dates and numbers become live values.",
        },
        {
          value: "RAW",
          label: "Store exactly as written",
          description: "Everything stays literal text — =SUM(...) stays a string.",
        },
      ],
    },
  ],
  outputs: [
    {
      name: "spreadsheetId",
      type: "string",
      description: "Spreadsheet id the cell was updated in (echoed).",
    },
    {
      name: "sheetName",
      type: "string",
      description: "Sheet/tab title the cell was updated in (echoed).",
    },
    {
      name: "cell",
      type: "string",
      description: "A1 single-cell reference (echoed).",
    },
    {
      name: "updated",
      type: "boolean",
      description: "Always `true` on success — convenience scalar for branch-on-success.",
    },
    {
      name: "updatedRange",
      type: "string",
      description: "A1 range Google wrote (e.g. `Sheet1!B5`), or null when Google omits it.",
      nullable: true,
    },
    {
      name: "updatedCells",
      type: "number",
      description: "Count of cells written (always 1 for a single-cell update).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Updates a single cell value — overwrites whatever was there. Existing value is replaced.",
};
