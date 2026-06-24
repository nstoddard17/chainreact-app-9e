import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-sheets:clear_range`.
 *
 * Mirrors `clearRange.schema.ts`:
 *   - `spreadsheetId`  (required) — combobox from
 *                       `google-sheets:spreadsheets`.
 *   - `range`          (required) — A1 notation (typically with a
 *                       sheet-name prefix like `Sheet1!A2:Z100`; bare
 *                       sheet names are also accepted by Sheets).
 *
 * Clears cell *values* in the range. Formatting + data validation are
 * preserved (Google's documented behavior). Outputs are purely
 * structural — `{spreadsheetId, clearedRange}`.
 *
 * Risk classification — `high` + `isDestructive: true` +
 * `requiresConfirmation: true`. Per CLAUDE.md SEC-2A: clearing cells
 * is irreversibly destructive of caller data within the addressed
 * range. Confirmation modal is wired by the schema's risk fields.
 */
export const googleSheetsClearRangeMeta: ActionMeta = {
  key: "google-sheets:clear_range",
  provider: "google-sheets",
  type: "clear_range",
  displayName: "Clear Range",
  description:
    "**Destructive.** Clear cell values in a Google Sheets range via `spreadsheets.values.clear`. Formatting and data validation are preserved; only the values are removed. Requires typed confirmation before activation + real Run-now because the clear cannot be undone from this action.",
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
        "A1-notation range to clear. Typical shape: `Sheet1!A2:Z100` (clears row 2 through 100 across columns A–Z while preserving the header row). Use `Sheet1!A:Z` to wipe every value on the tab; `Sheet1` alone clears the entire sheet.",
      type: "text",
      required: true,
      placeholder: "Sheet1!A2:Z100",
    },
  ],
  outputs: [
    {
      name: "spreadsheetId",
      type: "string",
      description: "Spreadsheet id the clear ran against (echoed).",
    },
    {
      name: "clearedRange",
      type: "string",
      description:
        "A1 range Google actually cleared (Sheets may expand bounded ranges to fit the data — surfaces here so workflows know the precise rectangle), or null when Google omits it.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Destructive — clears cell values in the supplied range. Existing cell content cannot be recovered from this action. Formatting and data validation rules are preserved.",
};
