import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-sheets:append_row`.
 *
 * Mirrors `appendRow.schema.ts` EXACTLY — the schema uses `range` (not
 * `sheetName`) as the row-target spec, so the meta surfaces `range` as
 * a text input rather than a sheet picker. The plan-level memo asked
 * for a sheet combobox here; the live schema does not accept one, and
 * the slice rule is "use exact runtime field names, do not infer from
 * plan memory if live schema differs."
 *
 * Fields:
 *   - `spreadsheetId`     (required) — combobox from
 *                          `google-sheets:spreadsheets`.
 *   - `range`             (required) — A1 notation (typically
 *                          `Sheet1!A:A` or `Sheet1!A:Z` so Sheets
 *                          detects the table and appends below the
 *                          bottom row).
 *   - `values`            (required) — textarea paste-JSON. Array of
 *                          primitives — one cell per column, in the
 *                          order the sheet expects. Caller knows the
 *                          column order; the UI stores the literal
 *                          string, runtime validates.
 *   - `valueInputOption`  (required, Q11) — RAW vs USER_ENTERED.
 *                          Authors choose explicitly: V1 silently
 *                          defaulted to RAW which surprised users
 *                          with formula content.
 *   - `insertDataOption`  (required select, defaults to INSERT_ROWS).
 *                          Mirrors the schema's `.default("INSERT_ROWS")`;
 *                          Q11-safe because INSERT_ROWS preserves
 *                          existing data rather than overwriting.
 *
 * Outputs match `appendRow.ts:return` — structural counters only
 * (`{spreadsheetId, tableRange, updatedRange, updatedRows,
 * updatedColumns, updatedCells}`). Nothing user-content; nothing
 * sensitive.
 */
export const googleSheetsAppendRowMeta: ActionMeta = {
  key: "google-sheets:append_row",
  provider: "google-sheets",
  type: "append_row",
  displayName: "Append Row",
  description:
    "Append a single row to a Google Sheet. Sheets detects the existing table from the supplied range and appends below the bottom row. Add one cell value per column, in column order. Required choice: parse values as if typed in Sheets, or store them exactly as written.",
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
        "A1-notation range Sheets uses to locate the table. Common shapes: `Sheet1!A:A` or `Sheet1!A:Z` (Sheets finds the bottom of those columns and appends below — typical), or just `Sheet1` (finds the bottom of the entire sheet — less precise).",
      type: "text",
      required: true,
      placeholder: "Sheet1!A:Z",
    },
    {
      name: "values",
      label: "Row values",
      description:
        "Add one value per column, in the column order the sheet expects. With USER_ENTERED below, Sheets parses numbers, dates, and formulas as if you typed them into the sheet.",
      type: "string-array",
      required: true,
      placeholder: "Type a cell value and press Enter",
    },
    {
      name: "valueInputOption",
      label: "Value input option",
      description:
        "How Sheets treats your values. Required — 'parse as typed' makes =SUM(...), dates and numbers live; 'store exactly' keeps them as text.",
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
    {
      name: "insertDataOption",
      label: "Insert data option",
      description:
        "What Sheets does with existing rows below the table. INSERT_ROWS (default) pushes existing rows down to make room — preserves data. OVERWRITE overwrites any cells in the way — destructive on a populated sheet.",
      type: "select",
      required: true,
      defaultValue: "INSERT_ROWS",
      options: [
        {
          value: "INSERT_ROWS",
          label: "INSERT_ROWS",
          description: "Push existing rows down (default — preserves data).",
        },
        {
          value: "OVERWRITE",
          label: "OVERWRITE",
          description: "Overwrite existing cells — destructive on a populated sheet.",
        },
      ],
    },
  ],
  outputs: [
    {
      name: "spreadsheetId",
      type: "string",
      description: "Spreadsheet id the row was appended to (echoed).",
    },
    {
      name: "tableRange",
      type: "string",
      description:
        "A1 range Google identified as the existing table (the data block Sheets appended below), or null when there is no existing table (e.g. an empty sheet). Useful for debugging append placement.",
      nullable: true,
    },
    {
      name: "updatedRange",
      type: "string",
      description:
        "A1 range of the cells Google wrote (e.g. `Sheet1!A42:D42`), or null when Google omits it. Wire downstream when you need to know exactly where the new row landed.",
      nullable: true,
    },
    {
      name: "updatedRows",
      type: "number",
      description: "Count of rows written (always 1 for a single-row append).",
    },
    {
      name: "updatedColumns",
      type: "number",
      description: "Count of distinct columns written (== `values.length`).",
    },
    {
      name: "updatedCells",
      type: "number",
      description: "Total cells written (== updatedRows × updatedColumns).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Appends data to a Google Sheet — visible to anyone with view access; can overwrite when insertDataOption is OVERWRITE.",
};
