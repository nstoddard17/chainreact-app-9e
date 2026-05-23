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
    "Update a single cell value via `spreadsheets.values.update`. Specify sheet + cell separately (`Sheet1` + `B5`); the handler composes the A1 range. Value can be a string, number, boolean, or `null` (blanks the cell). **Q11 required:** choose RAW vs USER_ENTERED explicitly.",
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
        "How Sheets interprets the value. **No default — pick explicitly.** RAW: literal text (`=SUM(A1:A10)` stays a string). USER_ENTERED: parses formulas, dates, numbers as a human would type them.",
      type: "select",
      required: true,
      options: [
        {
          value: "RAW",
          label: "RAW",
          description: "Literal text — formulas / dates / numbers stay as the string you passed.",
        },
        {
          value: "USER_ENTERED",
          label: "USER_ENTERED",
          description: "Parsed as if a human typed it — formulas evaluate, dates parse, `\"42\"` becomes a number.",
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
      description: "A1 range Google wrote (e.g. `Sheet1!B5`).",
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
