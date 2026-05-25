import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:delete_worksheet` —
 * Slice 4.EXCEL-META-3. Mirrors `deleteWorksheet.schema.ts`.
 * **High-risk destructive** — deletes an entire worksheet and all its
 * data. Per Marcus's decision, high + destructive + requiresConfirmation
 * (the more catastrophic of the two delete actions).
 */
export const microsoftExcelDeleteWorksheetMeta: ActionMeta = {
  key: "microsoft-excel:delete_worksheet",
  provider: "microsoft-excel",
  type: "delete_worksheet",
  displayName: "Delete Worksheet",
  description:
    "Delete an entire worksheet (tab) and all of its data from a workbook. This is irreversible from the workflow and removes every cell on the sheet — requires confirmation.",
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
      description: "The worksheet to delete. Pick a workbook first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:worksheets",
      dependsOn: "workbookId",
      placeholder: "Select workbook first",
    },
  ],
  outputs: [
    { name: "workbookId", type: "string", description: "The workbook id." },
    { name: "worksheetName", type: "string", description: "The worksheet deleted." },
    { name: "deleted", type: "boolean", description: "True when the worksheet was deleted." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Permanently deletes an entire worksheet and all its data — irreversible from the workflow. Confirmation required.",
};
