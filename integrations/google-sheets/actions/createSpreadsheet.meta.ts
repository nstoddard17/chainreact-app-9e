import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-sheets:create_spreadsheet`.
 *
 * Mirrors `createSpreadsheet.schema.ts`:
 *   - `title`              (required) — spreadsheet file name.
 *   - `initialSheetName`   (optional) — title for the first sheet.
 *                           Omit to let Google create the default
 *                           "Sheet1" automatically.
 *
 * V1 template / initialData / folder / description chrome is deliberately
 * NOT ported (parity-google-sheets.md GS-R10) — composes with Drive
 * actions for placement and append_row / update_row for data prefill.
 *
 * Outputs match `createSpreadsheet.ts:return` — `{spreadsheetId,
 * spreadsheetUrl, title, sheets[], firstSheet}`. `spreadsheetUrl` is
 * the standard Google Docs share URL — not access-bearing on its own
 * (recipient still needs Google account sign-in + share permission).
 * Marked medium risk because it creates a new external resource.
 */
export const googleSheetsCreateSpreadsheetMeta: ActionMeta = {
  key: "google-sheets:create_spreadsheet",
  provider: "google-sheets",
  type: "create_spreadsheet",
  displayName: "Create Spreadsheet",
  description:
    "Create a new Google Sheets file via `spreadsheets.create`. Bare API surface — pass a title, optionally name the first sheet. Each call creates a fresh file (re-running the action makes a second spreadsheet). For data prefill compose with Append Row / Update Row downstream; for folder placement compose with a Google Drive move action.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "title",
      label: "Title",
      description:
        "File name for the new spreadsheet. Shown in Google Drive + the spreadsheet's tab. Drive does not enforce uniqueness — re-running this action creates a second file with the same name.",
      type: "text",
      required: true,
      placeholder: "Q4 Forecast",
    },
    {
      name: "initialSheetName",
      label: "Initial sheet name",
      description:
        "Optional title for the first sheet/tab. Omit to let Google create its default `Sheet1`. Pass a non-empty string when you want a domain-meaningful tab name (e.g. `Orders`, `Inventory`).",
      type: "text",
      required: false,
      placeholder: "Orders",
    },
  ],
  outputs: [
    {
      name: "spreadsheetId",
      type: "string",
      description:
        "Google-assigned spreadsheet id (`1aBc…`). Wire to downstream Append Row / Update Row / Read Rows / etc.",
    },
    {
      name: "spreadsheetUrl",
      type: "string",
      description:
        "Standard Google Docs share URL (`https://docs.google.com/spreadsheets/d/<id>/edit`). Not access-bearing — recipients still need Google sign-in + share permission. Send via email / Slack to share.",
    },
    {
      name: "title",
      type: "string",
      description: "Echoed file title (== input.title when Google accepted it).",
    },
    {
      name: "sheets",
      type: "array",
      description:
        "One entry per created sheet: `{sheetId, title}`. With `initialSheetName` set there's exactly one entry; without, the response contains Google's default `Sheet1`.",
    },
    {
      name: "firstSheet",
      type: "object",
      description:
        "Convenience scalar — `sheets[0]` or `null`. Wire `{{node.firstSheet.title}}` into a follow-up Append Row's range.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a new Google Sheets file in the connected Google account. Each call makes a fresh file — re-runs create duplicates.",
};
