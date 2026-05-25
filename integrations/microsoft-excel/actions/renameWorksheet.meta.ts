import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:rename_worksheet` —
 * Slice 4.EXCEL-META-3. Mirrors `renameWorksheet.schema.ts`.
 * `worksheetName` is the CURRENT sheet (picker); `newWorksheetName` is the
 * new name being typed (free text, ≤31 chars).
 */
export const microsoftExcelRenameWorksheetMeta: ActionMeta = {
  key: "microsoft-excel:rename_worksheet",
  provider: "microsoft-excel",
  type: "rename_worksheet",
  displayName: "Rename Worksheet",
  description:
    "Rename an existing worksheet (tab). The new name must be unique within the workbook and 31 characters or fewer.",
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
      label: "Worksheet (current name)",
      description: "The worksheet to rename. Pick a workbook first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:worksheets",
      dependsOn: "workbookId",
      placeholder: "Select workbook first",
    },
    {
      name: "newWorksheetName",
      label: "New Name",
      description: "The new worksheet name (1–31 characters).",
      type: "text",
      required: true,
      placeholder: "Archived Q2",
    },
  ],
  outputs: [
    { name: "workbookId", type: "string", description: "The workbook id." },
    { name: "oldWorksheetName", type: "string", description: "The previous worksheet name." },
    { name: "newWorksheetName", type: "string", description: "The new worksheet name." },
    { name: "worksheetId", type: "string", description: "Graph id of the renamed worksheet." },
    { name: "position", type: "number", description: "0-based position within the workbook." },
    { name: "renamed", type: "boolean", description: "True when the rename succeeded." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Renames a worksheet — recoverable external write.",
};
