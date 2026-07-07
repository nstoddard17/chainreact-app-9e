import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-sheets:batch_update`.
 *
 * Mirrors `batchUpdate.schema.ts`:
 *   - `spreadsheetId`     (required) — combobox from
 *                          `google-sheets:spreadsheets`.
 *   - `valueInputOption`  (required, Q11) — RAW vs USER_ENTERED.
 *                          V1 hardcoded USER_ENTERED; V2 forces the
 *                          choice (same Q11 rule as append_row /
 *                          update_row / update_cell).
 *   - `updates`           (required) — paste-JSON `Array<{range, values}>`
 *                          (1..100 entries). Each `range` MUST include
 *                          a sheet-name prefix (e.g. `Sheet1!A1:B2`).
 *                          `values` is a 2D array of cell primitives
 *                          (`string | number | boolean | null`).
 *
 * Outputs match `batchUpdate.ts:return` — top-level totals +
 * per-update structural counters. No cell content is echoed.
 *
 * Risk classification — `medium`. Batch writes mutate existing cells
 * (recoverable in the sense that callers can re-write but not auto-
 * revert). Not high-risk: no money / no external-comm, recovery is
 * symmetric to any other Sheets write.
 */
export const googleSheetsBatchUpdateMeta: ActionMeta = {
  key: "google-sheets:batch_update",
  provider: "google-sheets",
  type: "batch_update",
  displayName: "Batch Update",
  description:
    "Write multiple ranges in one call via `spreadsheets.values.batchUpdate`. Pass a JSON array of `{range, values}` entries (1..100). Each `range` MUST include a sheet-name prefix (e.g. `Sheet1!A1:B2`); `values` is a 2D array. **Q11 required:** choose RAW vs USER_ENTERED explicitly. Overwrites whatever was in the addressed cells.",
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
      name: "updates",
      label: "Updates",
      description:
        "JSON array of `[{range, values}]` entries (1..100). Each `range` MUST include the sheet-name prefix (e.g. `\"Sheet1!A1:B2\"`); ranges without a sheet prefix are rejected at parse time. `values` is a 2D array — each inner array is a row, cells are strings / numbers / booleans / `null`. Enter a JSON array or wire `{{...}}` from upstream.",
      type: "json",
      required: true,
      advanced: true,
      jsonShape: "array",
      placeholder:
        '[{"range":"Sheet1!A1:B2","values":[["a","b"],["c","d"]]}]',
    },
  ],
  outputs: [
    {
      name: "spreadsheetId",
      type: "string",
      description: "Spreadsheet id the batch ran against (echoed).",
    },
    {
      name: "totalUpdatedRanges",
      type: "number",
      description: "Count of update entries that succeeded (== `responses.length`).",
    },
    {
      name: "totalUpdatedCells",
      type: "number",
      description: "Sum of cells written across all update entries.",
    },
    {
      name: "totalUpdatedRows",
      type: "number",
      description: "Sum of rows written across all update entries.",
    },
    {
      name: "totalUpdatedColumns",
      type: "number",
      description: "Sum of distinct columns written across all update entries.",
    },
    {
      name: "responses",
      type: "array",
      description:
        "Per-update structural counters, one entry per input `updates[]` (same order).",
      fields: [
        {
          name: "updatedRange",
          type: "string",
          description: "A1 range Google wrote for this entry, or null when Google omits it.",
          nullable: true,
        },
        { name: "updatedRows", type: "number", description: "Rows written for this entry." },
        { name: "updatedColumns", type: "number", description: "Distinct columns written for this entry." },
        { name: "updatedCells", type: "number", description: "Cells written for this entry." },
      ],
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 110,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Batch-updates values in one or more ranges; overwrites existing cell content. Recoverable only by re-writing the prior values.",
};
