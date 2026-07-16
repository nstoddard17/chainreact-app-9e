import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-excel:find_row` —
 * Slice 4.EXCEL-READ-2. Mirrors `findRow.schema.ts`. Read action (low risk).
 *
 * Finds the first table row whose `lookupColumn` (header name) equals
 * `lookupValue` (string-coerced compare), scanning one bounded page.
 * `firstMatch` carries the matched row's cells → marked sensitive.
 * `workbookId` → workbooks resolver; `tableName` → tables resolver
 * (dependsOn workbookId); `lookupColumn` → table_columns resolver
 * (dependsOn workbookId + tableName, RESOLVERS-1) with manual entry
 * kept for variable wiring / unlisted headers.
 */
export const microsoftExcelFindRowMeta: ActionMeta = {
  key: "microsoft-excel:find_row",
  provider: "microsoft-excel",
  type: "find_row",
  displayName: "Find Row",
  description:
    "Find the first row in an Excel table whose value in a given column equals a search value (string-compared). Scans one bounded page (Max Rows, 1–500, default 100). Returns the first match or a no-match result; a missing column is an error.",
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
      description: "The Excel table to search. Pick a workbook first.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:tables",
      dependsOn: "workbookId",
      placeholder: "Select workbook first",
    },
    {
      name: "lookupColumn",
      label: "Lookup Column",
      description:
        "The column to match against. Pick one from the table's headers, or type a header name.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-excel:table_columns",
      dependsOn: ["workbookId", "tableName"],
      allowManualEntry: true,
      placeholder: "Select table first",
    },
    {
      name: "lookupValue",
      label: "Lookup Value",
      description: "Value to match. Comparison is string-based — `100` matches `\"100\"`.",
      type: "text",
      required: true,
      placeholder: "ada@example.com",
    },
    {
      name: "maxRows",
      label: "Max Rows",
      description: "How many rows to scan at most (1–500). Default 100.",
      type: "number",
      required: false,
      defaultValue: 100,
      advanced: true,
      numeric: { min: 1, max: 500, integer: true },
    },
  ],
  outputs: [
    { name: "found", type: "boolean", description: "True when a matching row was found." },
    {
      name: "firstMatch",
      type: "object",
      description:
        "The first matching row as `{ index, cells }`, or null when nothing matched. Contains table cell data.",
      sensitive: true,
    },
    { name: "scanned", type: "number", description: "Number of rows scanned (bounded by Max Rows)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 130,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Read-only — scans table rows for a match, no mutation.",
};
