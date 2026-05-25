import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:create_worksheet` —
 * Slice 4.EXCEL-META-3. Mirrors `createWorksheet.schema.ts`. `name` is a
 * NEW worksheet being created (free text, ≤31 chars) — no picker.
 */
export const microsoftExcelCreateWorksheetMeta: ActionMeta = {
  key: "microsoft-excel:create_worksheet",
  provider: "microsoft-excel",
  type: "create_worksheet",
  displayName: "Create Worksheet",
  description:
    "Add a new worksheet (tab) to a workbook. The name must be unique within the workbook and 31 characters or fewer.",
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
      name: "name",
      label: "New Worksheet Name",
      description: "Name for the new worksheet (1–31 characters, unique within the workbook).",
      type: "text",
      required: true,
      placeholder: "Q3 Results",
    },
  ],
  outputs: [
    { name: "worksheetId", type: "string", description: "Graph id of the created worksheet." },
    { name: "name", type: "string", description: "Name of the created worksheet." },
    { name: "position", type: "number", description: "0-based position within the workbook." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Creates a worksheet — recoverable external write.",
};
