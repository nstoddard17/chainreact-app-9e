import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-sheets:get_sheet_metadata`.
 *
 * Mirrors `getSheetMetadata.schema.ts`:
 *   - `spreadsheetId`  (required) — async combobox from
 *                       `google-sheets:spreadsheets`. Only field — the
 *                       schema deliberately does NOT expose
 *                       `includeGridData` because cell payloads belong
 *                       in `read_rows`.
 *
 * Outputs match `getSheetMetadata.ts:return` — flattened workbook
 * metadata `{spreadsheetId, title, locale, timeZone, sheets[]}` where
 * each `sheets[]` entry is `{sheetId, title, index, sheetType, rowCount,
 * columnCount}`. Purely structural — no cell content, nothing sensitive.
 */
export const googleSheetsGetSheetMetadataMeta: ActionMeta = {
  key: "google-sheets:get_sheet_metadata",
  provider: "google-sheets",
  type: "get_sheet_metadata",
  displayName: "Get Sheet Metadata",
  description:
    "Read spreadsheet-level + per-tab metadata via `spreadsheets.get`. Read-only. Returns workbook title / locale / timeZone plus an array of tab descriptors (sheetId, title, index, sheetType, rowCount, columnCount). Use for branch-on-tab-count, find-a-sheetId-by-title, etc.",
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
  ],
  outputs: [
    {
      name: "spreadsheetId",
      type: "string",
      description: "Spreadsheet id (echoed from the input).",
    },
    {
      name: "title",
      type: "string",
      description: "Top-level spreadsheet title (e.g. \"Q4 Forecast\").",
    },
    {
      name: "locale",
      type: "string",
      description:
        "Spreadsheet-level locale (e.g. `en_US`). Drives default number / date formatting in the sheet.",
    },
    {
      name: "timeZone",
      type: "string",
      description:
        "Spreadsheet-level IANA time zone (e.g. `America/Los_Angeles`). Drives time-of-day display + `NOW()` evaluation.",
    },
    {
      name: "sheets",
      type: "array",
      description:
        "One entry per worksheet tab: `{sheetId, title, index, sheetType, rowCount, columnCount}`. Drill via `{{node.sheets[0].title}}` or iterate. Purely structural — no cell content.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
