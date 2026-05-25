import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-sheets:get_cell_value`.
 *
 * Mirrors `getCellValue.schema.ts`:
 *   - `spreadsheetId`  (required) — async combobox from
 *                       `google-sheets:spreadsheets`.
 *   - `sheetName`      (required) — async combobox from
 *                       `google-sheets:sheets`, gated on spreadsheetId
 *                       via the Slice 3.33 dependsOn cascade. The
 *                       handler builds the A1 range as `<sheetName>!<cell>`.
 *   - `cell`           (required) — strict A1 single-cell reference
 *                       (regex `[A-Za-z]+[0-9]+`). Ranges / full
 *                       columns / full rows are rejected at parse time;
 *                       use `read_rows` for rectangles.
 *
 * Outputs match `getCellValue.ts:return` — `{spreadsheetId, sheetName,
 * cell, value}`. `value` carries cell content and is marked sensitive —
 * the same redaction story as `read_rows.values`.
 */
export const googleSheetsGetCellValueMeta: ActionMeta = {
  key: "google-sheets:get_cell_value",
  provider: "google-sheets",
  type: "get_cell_value",
  displayName: "Get Cell Value",
  description:
    "Read a single cell from a Google Sheet via `spreadsheets.values.get`. Read-only. Specify sheet + cell separately (`Sheet1` + `B5`); the handler composes the A1 range. Empty cells return `value: null` so workflows can branch on `{{node.value}} == null`. Use Read Rows for ranges.",
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
        "A1-style single-cell reference (`A1`, `B5`, `AA10`). Ranges (`A1:B5`), full columns (`A:A`), and full rows (`1:1`) are rejected at runtime — use Read Rows for rectangles.",
      type: "text",
      required: true,
      placeholder: "A1",
    },
  ],
  outputs: [
    {
      name: "spreadsheetId",
      type: "string",
      description: "Spreadsheet id the value was read from (echoed).",
    },
    {
      name: "sheetName",
      type: "string",
      description: "Sheet/tab title the value was read from (echoed).",
    },
    {
      name: "cell",
      type: "string",
      description: "A1 single-cell reference (echoed).",
    },
    {
      name: "value",
      type: "unknown",
      description:
        "The cell's value as Google returned it (string / number / boolean), or `null` when the cell is blank. Marked sensitive — workflows frequently store PII / financial data in sheet cells.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
