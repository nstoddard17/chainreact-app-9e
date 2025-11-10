import { NodeComponent } from "../../../types"

export const updateRowActionSchema: NodeComponent = {
  type: "google_sheets_action_update_row",
  title: "Update Row",
  description: "Update values in a specific row",
  icon: "Edit" as any,
  isTrigger: false,
  providerId: "google-sheets",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "rowNumber", label: "Row Number", type: "number", description: "The updated row number" },
    { name: "range", label: "Range", type: "string", description: "The range that was updated" },
    { name: "valuesWritten", label: "Values Written", type: "array", description: "The new values" }
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
      loadingPlaceholder: "Loading spreadsheets...",
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
      loadingPlaceholder: "Loading sheets...",
      description: "The specific sheet (tab) within the spreadsheet"
    },
    {
      name: "updateRowPreview",
      label: "Update Row",
      type: "google_sheets_update_row_preview",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      description: "Select a row and update its column values"
    },
    {
      name: "rowNumber",
      label: "Row Number (Optional - for automation)",
      type: "number",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      placeholder: "2",
      min: 1,
      supportsAI: true,
      description: "Specify row number using a variable (e.g., {{trigger.rowNumber}}). Leave empty to use table selection above."
    },
    {
      name: "values",
      label: "New Values (Optional - for automation)",
      type: "textarea",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      rows: 4,
      placeholder: JSON.stringify(["Value 1", "Value 2", "Value 3"], null, 2),
      supportsAI: true,
      description: "Array of new values for the row. Use this with variables for automation. If provided, this overrides the table column selections."
    }
  ]
}
