import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:read_range` —
 * Slice 4.EXCEL-READ-2. Mirrors `readRange.schema.ts`. Read action (low risk).
 *
 * Reads a caller-specified bounded A1 range (distinct from Export Sheet,
 * which reads the whole used range). `values` carries cell data → marked
 * sensitive; the true `rowCount` / `columnCount` plus a `truncated` flag are
 * surfaced. `workbookId` → workbooks resolver; `worksheetName` → worksheets
 * resolver (dependsOn workbookId).
 */
export const microsoftExcelReadRangeMeta: ActionMeta = {
  key: "microsoft-excel:read_range",
  provider: "microsoft-excel",
  type: "read_range",
  displayName: "Read Range",
  description:
    "Read a specific A1 range from a worksheet (e.g. A1:D10). Returns the cell-value matrix for the range. Bounded — full columns (A:A) and full rows (1:1) are rejected; very large ranges are capped. Use Export Sheet to read the whole used range.",
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
      description: "The worksheet (tab) to read. Pick a workbook first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:worksheets",
      dependsOn: "workbookId",
      placeholder: "Select workbook first",
    },
    {
      name: "address",
      label: "Range",
      description:
        "A1 range to read, e.g. `A1:D10` or a single cell `B5`. Must be bounded — full columns (`A:A`) and full rows (`1:1`) are not allowed.",
      type: "text",
      required: true,
      placeholder: "A1:D10",
    },
  ],
  outputs: [
    { name: "address", type: "string", description: "The A1 range Graph actually read back." },
    { name: "rowCount", type: "number", description: "True number of rows in the range." },
    { name: "columnCount", type: "number", description: "Number of columns in the range." },
    {
      name: "values",
      type: "array",
      description:
        "2D cell-value matrix (rows × columns); empty cells are null. Capped at 1000 rows. Contains spreadsheet cell data.",
      sensitive: true,
    },
    {
      name: "truncated",
      type: "boolean",
      description: "True when the range had more than 1000 rows and `values` was capped.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 110,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Read-only — returns cell values for a bounded range.",
};
