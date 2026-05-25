import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-excel:new_worksheet` —
 * Slice 4.EXCEL-META-3. Polling, workbook-scoped (set-difference on
 * worksheet names; a rename fires once for the new name). Activation
 * registered via `registerActivation("microsoft-excel", "new_worksheet",
 * ...)`. Payload carries worksheet metadata only — no cell values (the
 * runtime emits an always-empty `values` array as a shape-consistency
 * artifact, deliberately not surfaced here).
 */
export const microsoftExcelNewWorksheetTriggerMeta: TriggerMeta = {
  key: "microsoft-excel:new_worksheet",
  provider: "microsoft-excel",
  type: "new_worksheet",
  displayName: "New Worksheet",
  description:
    "Fires when a new worksheet (tab) appears in the chosen workbook. A rename surfaces as one event for the new name.",
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
  ],
  payloadShape: [
    { name: "workbookId", type: "string", description: "The workbook the worksheet was added to." },
    { name: "worksheetName", type: "string", description: "Name of the new worksheet." },
    { name: "worksheetId", type: "string", description: "Graph id of the new worksheet, or null." },
    { name: "position", type: "number", description: "0-based position within the workbook, or null." },
  ],
  displayOrder: 50,
};
