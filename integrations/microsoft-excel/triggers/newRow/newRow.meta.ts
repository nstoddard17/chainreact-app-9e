import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-excel:new_row` — Slice 4.EXCEL-META-3.
 *
 * Polling, worksheet-scoped. Activation hook registers via
 * `registerActivation("microsoft-excel", "new_row", ...)` and seeds the
 * row snapshot at activation time (first-poll-miss protection), so the
 * `trigger-meta-activation-invariant` test is satisfied without an
 * exemption. Microsoft Graph has no Excel change webhook — polling is the
 * V2-native model (manifest `webhookTrigger: false`).
 *
 * Internal server-managed state (`pollingEnabled`, `snapshot`, `polling`)
 * is intentionally NOT surfaced as `fields[]` (mirrors the Gmail / OneNote
 * polling-trigger convention). `values` in the payload carries the new
 * row's cell data → marked sensitive.
 */
export const microsoftExcelNewRowTriggerMeta: TriggerMeta = {
  key: "microsoft-excel:new_row",
  provider: "microsoft-excel",
  type: "new_row",
  displayName: "New Row",
  description:
    "Fires when a new row appears in the chosen worksheet. Worksheet rows are position-keyed, so mid-sheet inserts can surface as new rows on the next poll (use a table trigger for stable-id tracking).",
  category: "data",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "workbookId",
      label: "Workbook",
      description: "The Excel workbook (file) to watch.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:workbooks",
      placeholder: "Search workbooks…",
    },
    {
      name: "worksheetName",
      label: "Worksheet",
      description: "The worksheet (tab) to watch. Pick a workbook first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:worksheets",
      dependsOn: "workbookId",
      placeholder: "Select workbook first",
    },
  ],
  payloadShape: [
    { name: "workbookId", type: "string", description: "The workbook the row was added to." },
    { name: "worksheetName", type: "string", description: "The worksheet the row was added to." },
    { name: "rowIndex", type: "number", description: "1-based index of the new row." },
    {
      name: "values",
      type: "array",
      description: "The new row's cell values (spreadsheet content).",
      sensitive: true,
    },
  ],
  displayOrder: 10,
};
