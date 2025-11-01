import { NodeComponent } from "../../../types"

export const findRowActionSchema: NodeComponent = {
  type: "google_sheets_action_find_row",
  title: "Find Row",
  description: "Find a row by column value or search criteria",
  icon: "Search" as any,
  isTrigger: false,
  providerId: "google-sheets",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "rowNumber", label: "Row Number", type: "number", description: "The row number found" },
    { name: "rowData", label: "Row Data", type: "array", description: "The values in the found row" },
    { name: "found", label: "Found", type: "boolean", description: "Whether a matching row was found" }
  ],
  configSchema: [
    {
      name: "spreadsheetId",
      label: "Spreadsheet",
      type: "select",
      dynamic: "google-sheets_spreadsheets",
      required: true,
      loadOnMount: true,
      placeholder: "Select a spreadsheet"
    },
    {
      name: "sheetName",
      label: "Sheet",
      type: "select",
      dynamic: "google-sheets_sheets",
      required: true,
      dependsOn: "spreadsheetId",
      placeholder: "Select a sheet"
    },
    {
      name: "searchColumn",
      label: "Search Column",
      type: "select",
      dynamic: "google-sheets_columns",
      required: true,
      dependsOn: "sheetName",
      placeholder: "Select column to search in"
    },
    {
      name: "searchValue",
      label: "Search Value",
      type: "text",
      required: true,
      placeholder: "{{trigger.email}}",
      supportsAI: true,
      description: "Value to search for"
    },
    {
      name: "matchType",
      label: "Match Type",
      type: "select",
      required: false,
      options: [
        { value: "exact", label: "Exact Match" },
        { value: "contains", label: "Contains" },
        { value: "starts_with", label: "Starts With" }
      ],
      defaultValue: "exact",
      description: "How to match the search value"
    }
  ]
}
