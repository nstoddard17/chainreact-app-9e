import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:get_worksheets` —
 * Slice 4.EXCEL-META-3. Mirrors `getWorksheets.schema.ts`. Read action
 * (low risk). Output is worksheet metadata (names/ids/position), not cell
 * content.
 */
export const microsoftExcelGetWorksheetsMeta: ActionMeta = {
  key: "microsoft-excel:get_worksheets",
  provider: "microsoft-excel",
  type: "get_worksheets",
  displayName: "Get Worksheets",
  description:
    "List the worksheets (tabs) in a workbook, with their ids, names, position, and visibility.",
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
  ],
  outputs: [
    { name: "worksheets", type: "array", description: "Worksheets: each `{ worksheetId, name, position, visibility }`." },
    { name: "count", type: "number", description: "Number of worksheets returned." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 100,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Read-only — lists worksheet metadata.",
};
