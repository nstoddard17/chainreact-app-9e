import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:delete_row` — Slice 4.EXCEL-META-3.
 * Mirrors `deleteRow.schema.ts`. **High-risk destructive** — deletes a row
 * and shifts subsequent rows up; the data is gone. Per Marcus's decision,
 * both delete_row and delete_worksheet are high + destructive +
 * requiresConfirmation (mirrors the dropbox `delete_file` destructive-trio
 * precedent).
 */
export const microsoftExcelDeleteRowMeta: ActionMeta = {
  key: "microsoft-excel:delete_row",
  provider: "microsoft-excel",
  type: "delete_row",
  displayName: "Delete Row",
  description:
    "Delete a row from a worksheet by its 1-based row number. Subsequent rows shift up. This permanently removes the row's data and cannot be undone from the workflow — requires confirmation.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workbookId",
      label: "Workbook",
      description: "The Excel workbook (file) from your OneDrive.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:workbooks",
      placeholder: "Search workbooks…",
    },
    {
      name: "worksheetName",
      label: "Worksheet",
      description: "The worksheet (tab) to delete from. Pick a workbook first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:worksheets",
      dependsOn: "workbookId",
      placeholder: "Select workbook first",
    },
    {
      name: "rowNumber",
      label: "Row Number",
      description: "1-based row number to delete.",
      type: "number",
      required: true,
      numeric: { min: 1, integer: true },
    },
  ],
  outputs: [
    { name: "workbookId", type: "string", description: "The workbook id." },
    { name: "worksheetName", type: "string", description: "The worksheet deleted from." },
    { name: "rowNumber", type: "number", description: "The 1-based row deleted." },
    { name: "address", type: "string", description: "A1 range that was deleted." },
    { name: "deleted", type: "boolean", description: "True when the row was deleted." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Permanently deletes a row and shifts rows up — irreversible from the workflow. Confirmation required.",
};
