import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-sheets:update_row`.
 *
 * Mirrors `updateRow.schema.ts` EXACTLY — like `append_row`, the schema
 * uses `range` (not `sheetName` + `rowNumber`) as the target spec. The
 * caller passes the precise rectangle to overwrite (typically
 * `Sheet1!A5:Z5` to update row 5). The meta surfaces `range` as a text
 * input — matching the schema, per the slice's "exact runtime field
 * names" rule.
 *
 * Fields:
 *   - `spreadsheetId`     (required) — combobox from
 *                          `google-sheets:spreadsheets`.
 *   - `range`             (required) — A1 notation. Pass the precise
 *                          target rectangle. If `values` is shorter than
 *                          the range width, Google leaves the extra
 *                          cells unchanged — V2 does not pad / truncate.
 *   - `values`            (required) — textarea paste-JSON. Same shape
 *                          as append_row's values.
 *   - `valueInputOption`  (required, Q11) — RAW vs USER_ENTERED.
 *                          Authors choose explicitly.
 *
 * V1's confirmation modal for update_row is NOT in scope for Batch 1
 * per the accepted plan. Adding `requiresConfirmation: true` here would
 * cascade into the SEC-2A schema check (`requiresConfirmation: true`
 * REQUIRES `riskLevel: "high"`), and Google Sheets row updates do not
 * meet the "high" bar (recoverable; non-money-moving).
 *
 * Outputs match `updateRow.ts:return` — structural counters only.
 */
export const googleSheetsUpdateRowMeta: ActionMeta = {
  key: "google-sheets:update_row",
  provider: "google-sheets",
  type: "update_row",
  displayName: "Update Row",
  description:
    "Update an existing row in a Google Sheet via `spreadsheets.values.update`. Overwrites the cells in the supplied range (e.g. `Sheet1!A5:Z5` to overwrite row 5). If `values` is shorter than the range width, Google leaves the extra cells unchanged. **Q11 required:** choose RAW vs USER_ENTERED explicitly.",
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
        "A1-notation EXACT target rectangle. Typical shape: `Sheet1!A5:Z5` to overwrite row 5 across columns A–Z. Sheets writes only the cells in this range; cells beyond `values.length` stay unchanged.",
      type: "text",
      required: true,
      placeholder: "Sheet1!A5:Z5",
    },
    {
      name: "values",
      label: "Values",
      description:
        "JSON array of primitive cell values for the row — one entry per column, in column order. Allowed: strings, numbers, booleans, `null`. The textarea stores the literal JSON string; runtime parses + validates. Min 1 entry. If shorter than the range width, extra cells stay unchanged.",
      type: "textarea",
      required: true,
      placeholder: '["alice@example.com","Updated",43,false]',
    },
    {
      name: "valueInputOption",
      label: "Value input option",
      description:
        "How Sheets interprets the values you pass. **No default — pick explicitly.** RAW: literal strings. USER_ENTERED: parses formulas, dates, numbers as if a human typed them.",
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
  ],
  outputs: [
    {
      name: "spreadsheetId",
      type: "string",
      description: "Spreadsheet id the row was updated in (echoed).",
    },
    {
      name: "updatedRange",
      type: "string",
      description: "A1 range of the cells Google wrote (e.g. `Sheet1!A5:D5`).",
    },
    {
      name: "updatedRows",
      type: "number",
      description: "Count of rows written.",
    },
    {
      name: "updatedColumns",
      type: "number",
      description: "Count of distinct columns written.",
    },
    {
      name: "updatedCells",
      type: "number",
      description: "Total cells written (== updatedRows × updatedColumns).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Updates an existing row in a Google Sheet — overwrites the cells in the supplied range. Existing values are replaced and not preserved.",
};
