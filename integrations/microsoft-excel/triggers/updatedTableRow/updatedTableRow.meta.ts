import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-excel:updated_table_row` —
 * Slice 4.EXCEL-META-3. Polling, table-scoped; SHA-256 content hash per
 * Graph stable row index — neighbor inserts/deletes do NOT spuriously
 * fire. Activation registered via
 * `registerActivation("microsoft-excel", "updated_table_row", ...)`.
 * `values` carries cell data → sensitive.
 */
export const microsoftExcelUpdatedTableRowTriggerMeta: TriggerMeta = {
  key: "microsoft-excel:updated_table_row",
  provider: "microsoft-excel",
  type: "updated_table_row",
  displayName: "Updated Table Row",
  description:
    "Fires when an existing row's cell values change in the chosen Excel table. Uses Graph-assigned stable row indexes, so neighbor inserts/deletes do not cause false updates.",
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
    { name: "workbookId", type: "string", description: "The workbook the row changed in." },
    { name: "tableName", type: "string", description: "The table the row changed in." },
    { name: "rowIndex", type: "number", description: "Graph-assigned stable index of the changed table row." },
    {
      name: "values",
      type: "array",
      description: "The changed table row's current cell values (spreadsheet content).",
      sensitive: true,
    },
  ],
  displayOrder: 40,
};
