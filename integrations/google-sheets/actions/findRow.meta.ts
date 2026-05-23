import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-sheets:find_row`.
 *
 * Mirrors `findRow.schema.ts`:
 *   - `spreadsheetId`  (required) — combobox from
 *                       `google-sheets:spreadsheets`.
 *   - `sheetName`      (required) — combobox from `google-sheets:sheets`,
 *                       gated on spreadsheetId.
 *   - `column`         (required) — HEADER NAME of the column to search
 *                       (row 0 is treated as headers; the handler
 *                       resolves header → column index). NOT a column
 *                       letter — that's a deliberate Batch 1 narrowing.
 *   - `value`          (required) — value to match against. Schema
 *                       accepts string / number / boolean; the UI stores
 *                       as text and the runtime coerces via
 *                       `String(value)` for comparison.
 *   - `operator`       (required) — Batch 1 supports only `equals`; the
 *                       select makes the single-value future-expansion
 *                       (`contains`, `starts_with`, etc.) non-breaking.
 *   - `returnAll`      (optional boolean, default false) — when false
 *                       the handler stops at the first match; when true
 *                       it scans the whole sheet.
 *
 * Outputs match `findRow.ts:return` — `{spreadsheetId, sheetName,
 * column, found, firstMatch, matches[], count}`. `firstMatch` /
 * `matches` carry row-level cell content and are marked sensitive.
 */
export const googleSheetsFindRowMeta: ActionMeta = {
  key: "google-sheets:find_row",
  provider: "google-sheets",
  type: "find_row",
  displayName: "Find Row",
  description:
    "Find rows in a Google Sheet whose value in a given column equals a search value. Reads the entire sheet (no server-side filter on Sheets' side) and scans client-side; large sheets pull every row. Row 0 is treated as headers — `column` is the HEADER NAME, not a column letter. Batch 1 supports `equals` only.",
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
      name: "column",
      label: "Column",
      description:
        "Header name of the column to search (e.g. `Email`, `Status`). The handler reads row 0 as headers and resolves this to a column index. Column letters / numeric indices are NOT accepted in Batch 1.",
      type: "text",
      required: true,
      placeholder: "Email",
    },
    {
      name: "value",
      label: "Value",
      description:
        "Value to match. Comparison is string-based — `\"100\"` stored as a number matches `\"100\"` passed as a string. Blank cells in the search column are skipped (never match against a non-empty value).",
      type: "text",
      required: true,
      placeholder: "alice@example.com",
    },
    {
      name: "operator",
      label: "Operator",
      description:
        "Match operator. Batch 1 ships `equals` only. Additional operators (`contains`, `starts_with`, `greater_than`) land in a follow-up slice without breaking existing callers.",
      type: "select",
      required: true,
      defaultValue: "equals",
      options: [
        {
          value: "equals",
          label: "equals",
          description: "Exact-match (string-coerced).",
        },
      ],
    },
    {
      name: "returnAll",
      label: "Return all matches",
      description:
        "When off (default), the handler stops at the first match. When on, it scans the entire sheet and returns every match. Sheets with thousands of rows pay the scan cost either way; this flag only changes whether the scan short-circuits.",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
  ],
  outputs: [
    {
      name: "spreadsheetId",
      type: "string",
      description: "Spreadsheet id the search ran against (echoed).",
    },
    {
      name: "sheetName",
      type: "string",
      description: "Sheet/tab title the search ran against (echoed).",
    },
    {
      name: "column",
      type: "string",
      description: "Header name searched (echoed).",
    },
    {
      name: "found",
      type: "boolean",
      description: "True when `matches.length > 0` — convenience scalar for branch-on-found.",
    },
    {
      name: "firstMatch",
      type: "object",
      description:
        "First match as `{rowNumber, rowData}` or `null` when nothing matched. `rowNumber` is 1-indexed including the header row. `rowData` is `{[headerName]: cellValue}`. Marked sensitive — the row's cell values flow through here.",
      sensitive: true,
    },
    {
      name: "matches",
      type: "array",
      description:
        "Every matching row as `[{rowNumber, rowData}]`. Empty array when nothing matched. When `returnAll` is off, contains at most one entry. Marked sensitive — same row-content reason as `firstMatch`.",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "`matches.length` — convenience scalar for branch-on-count.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
