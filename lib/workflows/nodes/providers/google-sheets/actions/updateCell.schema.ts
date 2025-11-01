import { NodeComponent } from "../../../types"

export const updateCellActionSchema: NodeComponent = {
  type: "google_sheets_action_update_cell",
  title: "Update Cell",
  description: "Update a specific cell value in a Google Sheet",
  icon: "Edit" as any,
  isTrigger: false,
  providerId: "google-sheets",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "cellAddress", label: "Cell Address", type: "string", description: "The updated cell address", example: "A1" },
    { name: "value", label: "Value", type: "string", description: "The new value", example: "Updated" },
    { name: "success", label: "Success", type: "boolean", description: "Whether the update succeeded", example: true }
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
      description: "Cell address in A1 notation",
      tooltip: "Examples: A1, B10, AA100. Use column letter + row number."
    },
    {
      name: "value",
      label: "New Value",
      type: "text",
      required: true,
      placeholder: "{{trigger.value}}",
      supportsAI: true,
      description: "The value to set in the cell"
    }
  ]
}
