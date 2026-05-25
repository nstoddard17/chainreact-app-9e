import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-excel:updated_row` —
 * Slice 4.EXCEL-META-3. Polling, worksheet-scoped; SHA-256 content hash
 * per 1-based position. Activation registered via
 * `registerActivation("microsoft-excel", "updated_row", ...)`. `values`
 * carries cell data → sensitive. Accepted limitation (V1 parity): a
 * mid-sheet insert/delete shifts positions, so shifted rows can also
 * surface as updated.
 */
export const microsoftExcelUpdatedRowTriggerMeta: TriggerMeta = {
  key: "microsoft-excel:updated_row",
  provider: "microsoft-excel",
  type: "updated_row",
  displayName: "Updated Row",
  description:
    "Fires when an existing row's cell values change in the chosen worksheet. Worksheet rows are position-keyed; a mid-sheet insert/delete shifts rows and can surface shifted rows as updated (use a table trigger for stable-id tracking).",
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
    { name: "workbookId", type: "string", description: "The workbook the row changed in." },
    { name: "worksheetName", type: "string", description: "The worksheet the row changed in." },
    { name: "rowIndex", type: "number", description: "1-based index of the changed row." },
    {
      name: "values",
      type: "array",
      description: "The changed row's current cell values (spreadsheet content).",
      sensitive: true,
    },
  ],
  displayOrder: 20,
};
