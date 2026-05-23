import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `google-sheets:new_worksheet`.
 *
 * Webhook-activated push trigger. Activation creates a Drive
 * `files.watch` channel on the spreadsheet's Drive file id and seeds
 * the initial worksheet-name baseline via `spreadsheets.get`. The
 * Drive watch fires on tab additions because they bump the
 * spreadsheet's `modifiedTime`. The receive route dispatches by
 * `(provider, eventType)`, so this trigger and `row_changed` can
 * coexist on the same spreadsheet with their own channels.
 *
 * Activation registry — registered in
 * `integrations/google-sheets/triggers/newWorksheet/index.ts` via
 * `registerActivation("google-sheets", "new_worksheet", activate)`.
 * The trigger-meta-activation-invariant test is satisfied; no
 * exemption needed.
 *
 * Config (mirrors `schema.ts`):
 *   - `spreadsheetId` (required) — combobox from
 *     `google-sheets:spreadsheets`.
 *
 * Payload mirrors `normalize.ts` exactly:
 *   `{changeKind, spreadsheetId, worksheetId, worksheetName, index, sheetType}`
 * Purely structural; no cell content. `worksheetName` is the only
 * field carrying user-typed input (the tab title), but workbook tab
 * titles are not PII in any meaningful sense (they're like file
 * names) — left non-sensitive.
 */
export const googleSheetsNewWorksheetTriggerMeta: TriggerMeta = {
  key: "google-sheets:new_worksheet",
  provider: "google-sheets",
  type: "new_worksheet",
  displayName: "New Worksheet",
  description:
    "Fires when a new worksheet (tab) is added to the configured Google Sheets file. Backed by a Drive `files.watch` channel — same transport as Row Changed but a separate channel per trigger node. Renames present as one event for the new tab name. Requires the connected Google account to retain Drive `files.watch` capability on the spreadsheet.",
  category: "data",
  activation: "webhook",
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
  payloadShape: [
    {
      name: "changeKind",
      type: "string",
      description: "Always `\"added\"` — included for parity with `row_changed`'s discriminated payload.",
    },
    {
      name: "spreadsheetId",
      type: "string",
      description: "Spreadsheet id the worksheet was added to (echoed from config).",
    },
    {
      name: "worksheetId",
      type: "number",
      description:
        "Numeric Sheets API sheetId assigned to the new worksheet. Stable across renames; a delete-then-re-create with the same name gets a fresh sheetId.",
    },
    {
      name: "worksheetName",
      type: "string",
      description: "Tab title at the moment of detection.",
    },
    {
      name: "index",
      type: "number",
      description:
        "0-indexed position of the new worksheet within the workbook. May be null when Sheets omits it from the response.",
    },
    {
      name: "sheetType",
      type: "string",
      description: "`\"GRID\"` (normal worksheet) or `\"OBJECT\"` (chart/object sheet). May be null when Sheets omits it.",
    },
  ],
  displayOrder: 10,
};
