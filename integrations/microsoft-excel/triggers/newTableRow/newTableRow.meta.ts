import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-excel:new_table_row` —
 * Slice 4.EXCEL-META-3. Polling, table-scoped. Graph assigns stable row
 * indexes, so mid-table inserts/deletes elsewhere don't spuriously fire.
 * Activation registered via
 * `registerActivation("microsoft-excel", "new_table_row", ...)`. `values`
 * carries cell data → sensitive.
 */
export const microsoftExcelNewTableRowTriggerMeta: TriggerMeta = {
  key: "microsoft-excel:new_table_row",
  provider: "microsoft-excel",
  type: "new_table_row",
  displayName: "New Table Row",
  description:
    "Fires when a new row is added to the chosen Excel table. Tables use Graph-assigned stable row indexes, so this is the reliable surface for change tracking (unlike worksheet position-keyed triggers).",
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
      name: "tableName",
      label: "Table",
      description: "The Excel table to watch. Pick a workbook first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:tables",
      dependsOn: "workbookId",
      placeholder: "Select workbook first",
    },
  ],
  payloadShape: [
    { name: "workbookId", type: "string", description: "The workbook the row was added to." },
    { name: "tableName", type: "string", description: "The table the row was added to." },
    { name: "rowIndex", type: "number", description: "Graph-assigned stable index of the new table row." },
    {
      name: "values",
      type: "array",
      description: "The new table row's cell values (spreadsheet content).",
      sensitive: true,
    },
  ],
  displayOrder: 30,
};
