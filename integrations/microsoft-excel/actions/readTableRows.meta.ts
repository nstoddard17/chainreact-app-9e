import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:read_table_rows` —
 * Slice 4.EXCEL-READ-2. Mirrors `readTableRows.schema.ts`. Read action (low
 * risk). One page only. `rows` carries cell data → marked sensitive.
 * `workbookId` → workbooks resolver; `tableName` → tables resolver
 * (dependsOn workbookId).
 */
export const microsoftExcelReadTableRowsMeta: ActionMeta = {
  key: "microsoft-excel:read_table_rows",
  provider: "microsoft-excel",
  type: "read_table_rows",
  displayName: "Read Table Rows",
  description:
    "Read one page of rows from an Excel table. Returns each row's stable index and cell values. Single page only (Max rows, 1–500, default 100) — pagination is not auto-followed.",
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
      name: "tableName",
      label: "Table",
      description: "The Excel table to read. Pick a workbook first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:tables",
      dependsOn: "workbookId",
      placeholder: "Select workbook first",
    },
    {
      name: "top",
      label: "Max rows",
      description: "How many rows to return at most (1–500). Default 100.",
      type: "number",
      required: false,
      defaultValue: 100,
      numeric: { min: 1, max: 500, integer: true },
    },
  ],
  outputs: [
    {
      name: "rows",
      type: "array",
      description:
        "The page of table rows — each `{ index, cells }` where `cells` is the row's value array. Contains table cell data.",
      sensitive: true,
    },
    { name: "count", type: "number", description: "Number of rows returned on this page." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 120,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Read-only — returns one page of table rows.",
};
