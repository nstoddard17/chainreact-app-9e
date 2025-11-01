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
      name: "range",
      label: "Range to Clear",
      type: "text",
      required: true,
      placeholder: "A1:D10, A:A, 5:5",
      supportsAI: true,
      description: "Range in A1 notation to clear",
      tooltip: "Examples: A1:D10 (rectangle), A:A (entire column), 5:5 (entire row)"
    }
  ]
}
