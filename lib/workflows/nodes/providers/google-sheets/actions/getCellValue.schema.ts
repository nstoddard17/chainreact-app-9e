import { NodeComponent } from "../../../types"

export const getCellValueActionSchema: NodeComponent = {
  type: "google_sheets_action_get_cell_value",
  title: "Get Cell Value",
  description: "Retrieve the value from a specific cell",
  icon: "Search" as any,
  isTrigger: false,
  providerId: "google-sheets",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "value", label: "Cell Value", type: "string", description: "The value in the cell" },
    { name: "cellAddress", label: "Cell Address", type: "string", description: "The cell address queried" },
    { name: "formattedValue", label: "Formatted Value", type: "string", description: "The formatted display value" }
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
      name: "cellAddress",
      label: "Cell Address",
      type: "text",
      required: true,
      placeholder: "A1, B5, etc.",
      supportsAI: true,
      description: "Cell address in A1 notation"
    }
  ]
}
