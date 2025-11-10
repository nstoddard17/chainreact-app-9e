import { NodeComponent } from "../../../types"

export const clearRangeActionSchema: NodeComponent = {
  type: "google_sheets_action_clear_range",
  title: "Clear Range",
  description: "Clear cell values in a specified range",
  icon: "Eraser" as any,
  isTrigger: false,
  providerId: "google-sheets",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "clearedRange", label: "Cleared Range", type: "string", description: "The range that was cleared" },
    { name: "cellsCleared", label: "Cells Cleared", type: "number", description: "Number of cells cleared" },
    { name: "success", label: "Success", type: "boolean", description: "Whether the operation succeeded" }
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
      name: "clearType",
      label: "Clear Type",
      type: "select",
      required: true,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      options: [
        { value: "range", label: "Specific Range" },
        { value: "last_row", label: "Last Row (Dynamic)" },
        { value: "specific_row", label: "Specific Row Number" }
      ],
      placeholder: "Select clear type",
      description: "Choose what to clear: a specific range, the last row dynamically, or a specific row number"
    },
    {
      name: "rangePreview",
      label: "Range Preview",
      type: "google_sheets_range_preview",
      required: false,
      dependsOn: "clearType",
      hidden: {
        $deps: ["clearType"],
        $condition: { clearType: { $ne: "range" } }
      },
      description: "Preview your spreadsheet and select the range to clear"
    },
    {
      name: "range",
      label: "Range to Clear",
      type: "text",
      required: false,
      dependsOn: "clearType",
      hidden: {
        $deps: ["clearType"],
        $condition: { clearType: { $ne: "range" } }
      },
      placeholder: "A1:D10, A:A, 5:5",
      supportsAI: true,
      description: "Range in A1 notation to clear",
      tooltip: "Examples: A1:D10 (rectangle), A:A (entire column), 5:5 (entire row)"
    },
    {
      name: "rowPreview",
      label: "Row Selection",
      type: "google_sheets_row_preview",
      required: false,
      dependsOn: "clearType",
      hidden: {
        $deps: ["clearType"],
        $condition: { clearType: { $ne: "specific_row" } }
      },
      description: "Click a row number to select which row to clear"
    },
    {
      name: "rowNumber",
      label: "Row Number",
      type: "hidden",
      required: false,
      dependsOn: "clearType",
      hidden: {
        $deps: ["clearType"],
        $condition: { clearType: { $ne: "specific_row" } }
      }
    }
  ]
}
