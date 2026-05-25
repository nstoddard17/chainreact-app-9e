import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-sheets:read_rows`.
 *
 * Mirrors `readRows.schema.ts`:
 *   - `spreadsheetId`      (required) — async combobox sourced from
 *                           `google-sheets:spreadsheets` (Slice 3.GSHEETS-2).
 *   - `range`              (required) — A1 notation. Schema treats this
 *                           as authoritative; the meta surfaces a text
 *                           input rather than splitting sheet picker +
 *                           range fragment because the schema does not
 *                           accept a separate sheetName.
 *   - `majorDimension`     (required select, defaults to "ROWS") — UI
 *                           default mirrors Sheets' API default; this is
 *                           Q11-safe (no surprise: rows-as-arrays is what
 *                           99% of consumers expect).
 *   - `valueRenderOption`  (optional select) — formatted / unformatted /
 *                           formula. Omit to use Sheets' FORMATTED_VALUE
 *                           default.
 *
 * Outputs match `readRows.ts:return` — `{range, majorDimension, values,
 * count}`. `values` carries cell data and is marked sensitive — workflows
 * frequently load PII / financial data into sheets, and the read-out
 * surfaces it back into the run-detail API + variable picker preview.
 */
export const googleSheetsReadRowsMeta: ActionMeta = {
  key: "google-sheets:read_rows",
  provider: "google-sheets",
  type: "read_rows",
  displayName: "Read Rows",
  description:
    "Read cell values from a Google Sheets range via `spreadsheets.values.get`. Read-only. Specify the sheet/range in A1 notation (`Sheet1!A:Z`, `Sheet1!A1:D100`, or just `Sheet1` for the whole tab). Returns the array-of-arrays Sheets shape with a top-level `count` for branch-on-empty workflows.",
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
      name: "range",
      label: "Range",
      description:
        "A1-notation range. Common shapes: `Sheet1!A:Z` (every row in columns A–Z — the typical choice), `Sheet1!A1:D100` (bounded rectangle), or just `Sheet1` (the whole tab). Use the read-rows comment block in `readRows.schema.ts` for the full grammar.",
      type: "text",
      required: true,
      placeholder: "Sheet1!A:Z",
    },
    {
      name: "majorDimension",
      label: "Major dimension",
      description:
        "How Google groups cells in the returned `values` array. `ROWS` (default) yields one inner array per row — what almost every workflow expects. `COLUMNS` yields one inner array per column.",
      type: "select",
      required: true,
      defaultValue: "ROWS",
      options: [
        {
          value: "ROWS",
          label: "ROWS",
          description: "Each inner array is a row (default).",
        },
        {
          value: "COLUMNS",
          label: "COLUMNS",
          description: "Each inner array is a column.",
        },
      ],
    },
    {
      name: "valueRenderOption",
      label: "Value render option",
      description:
        "How Sheets renders cell values. Omit to use Sheets' `FORMATTED_VALUE` default (numbers as displayed, formulas as their computed value).",
      type: "select",
      required: false,
      options: [
        {
          value: "FORMATTED_VALUE",
          label: "FORMATTED_VALUE",
          description: "Numbers / dates as the sheet displays them.",
        },
        {
          value: "UNFORMATTED_VALUE",
          label: "UNFORMATTED_VALUE",
          description: "Raw numeric values, no formatting applied.",
        },
        {
          value: "FORMULA",
          label: "FORMULA",
          description: "Raw formula text (`=SUM(A1:A10)`) instead of the computed value.",
        },
      ],
    },
  ],
  outputs: [
    {
      name: "range",
      type: "string",
      description:
        "A1-notation range Sheets actually read back (Sheets may expand bounded ranges to fit the data — surfaces here so workflows know the precise rectangle).",
    },
    {
      name: "majorDimension",
      type: "string",
      description: "`ROWS` or `COLUMNS` — echoed from the input.",
    },
    {
      name: "values",
      type: "array",
      description:
        "Array-of-arrays of cell values. Each inner array is a row (or column when `majorDimension: COLUMNS`). Empty when the range has no data. Marked sensitive — workflows frequently load PII / financial data into sheets.",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description:
        "`values.length` — convenience scalar for branch-on-empty workflows (`{{node.count}} == 0` skips the row-processing branch).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
