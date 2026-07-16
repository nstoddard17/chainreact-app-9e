import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:get_workbooks` —
 * Slice 4.EXCEL-META-3. Mirrors `getWorkbooks.schema.ts`. Read action
 * (low risk). Discovery surface that lists the user's `.xlsx` workbooks
 * with their ids — useful when wiring `workbookId` from upstream data
 * rather than the picker. Output is file metadata (names/urls), not cell
 * content.
 */
export const microsoftExcelGetWorkbooksMeta: ActionMeta = {
  key: "microsoft-excel:get_workbooks",
  provider: "microsoft-excel",
  type: "get_workbooks",
  displayName: "Get Workbooks",
  description:
    "List the Excel workbooks (.xlsx) in your OneDrive, with their ids, names, and URLs. Useful for discovering a workbook id to feed downstream actions.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "top",
      label: "Max results",
      description: "How many workbooks to return at most (1–1000).",
      type: "number",
      required: false,
      numeric: { min: 1, max: 1000, integer: true },
    },
  ],
  outputs: [
    { name: "workbooks", type: "array", description: "Workbooks: each `{ workbookId, name, webUrl, size, lastModifiedDateTime }`." },
    { name: "count", type: "number", description: "Number of workbooks returned." },
    { name: "hasMore", type: "boolean", description: "True when more workbooks exist beyond this page." },
    { name: "nextLink", type: "string", description: "Graph pagination cursor for the next page, or null." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Read-only — lists workbook metadata.",
};
