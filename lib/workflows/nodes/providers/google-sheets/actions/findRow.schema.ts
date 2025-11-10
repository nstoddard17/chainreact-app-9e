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
      placeholder: "Select a spreadsheet",
      description: "Choose a spreadsheet from your Google Sheets account"
    },
    {
      name: "sheetName",
      label: "Sheet",
      type: "select",
      dynamic: "google-sheets_sheets",
      required: true,
      dependsOn: "spreadsheetId",
      hidden: {
        $deps: ["spreadsheetId"],
        $condition: { spreadsheetId: { $exists: false } }
      },
      placeholder: "Select a sheet",
      description: "The specific sheet (tab) within the spreadsheet"
    },
    {
      name: "searchColumn",
      label: "Search Column",
      type: "select",
      dynamic: "google-sheets_columns",
      required: true,
      dependsOn: "sheetName",
      loadOnMount: true,
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      placeholder: "Select column to search in",
      description: "Choose a specific column or search across all columns"
    },
    {
      name: "searchValue",
      label: "Search Value",
      type: "text",
      required: true,
      dependsOn: "searchColumn",
      hidden: {
        $deps: ["searchColumn"],
        $condition: { searchColumn: { $exists: false } }
      },
      placeholder: "Enter text or variable (e.g., {{trigger.email}})",
      supportsAI: true,
      description: "Value to search for in the selected column"
    },
    {
      name: "matchType",
      label: "Match Type",
      type: "select",
      required: false,
      dependsOn: "searchColumn",
      hidden: {
        $deps: ["searchColumn"],
        $condition: { searchColumn: { $exists: false } }
      },
      options: [
        { value: "exact", label: "Exact Match" },
        { value: "contains", label: "Contains" },
        { value: "starts_with", label: "Starts With" }
      ],
      defaultValue: "exact",
      description: "How to match the search value"
    },
    {
      name: "findRowPreview",
      label: "Preview & Test",
      type: "google_sheets_find_row_preview",
      required: false,
      dependsOn: "searchValue",
      hidden: {
        $deps: ["searchValue"],
        $condition: {
          searchValue: { $exists: false }
        }
      },
      description: "Test your search to preview which row will be found"
    }
  ]
}
