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
    "Append a single row to a Google Sheet via `spreadsheets.values.append`. Sheets detects the existing table from the supplied range and appends below the bottom row. Pass the cell values as a JSON array of primitives in column order. **Q11 required:** choose RAW (literal — `=SUM(...)` stays a string) vs USER_ENTERED (parses formulas, dates, numbers as a human would).",
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
      label: "Values",
      description:
        "JSON array of primitive cell values for the new row — one entry per column, in the column order the sheet expects. Allowed: strings, numbers, booleans, `null`. The textarea stores the literal JSON string; runtime parses + validates. Min 1 entry.",
      type: "textarea",
      required: true,
      placeholder: '["alice@example.com","Premium",42,true]',
    },
    {
      name: "valueInputOption",
      label: "Value input option",
      description:
        "How Sheets interprets the values you pass. **No default — pick explicitly.** RAW: literal strings (`=SUM(...)` stays a string). USER_ENTERED: parses formulas, dates, numbers as if a human typed them.",
      type: "select",
      required: true,
      options: [
        {
          value: "RAW",
          label: "RAW",
          description: "Literal text — formulas / dates / numbers stay as the strings you passed.",
        },
        {
          value: "USER_ENTERED",
          label: "USER_ENTERED",
          description: "Parsed as if a human typed it — formulas evaluate, `2026-01-01` becomes a date, `\"42\"` becomes a number.",
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
        "A1 range Google identified as the existing table (the data block Sheets appended below). Useful for debugging append placement.",
    },
    {
      name: "updatedRange",
      type: "string",
      description:
        "A1 range of the cells Google wrote (e.g. `Sheet1!A42:D42`). Wire downstream when you need to know exactly where the new row landed.",
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
