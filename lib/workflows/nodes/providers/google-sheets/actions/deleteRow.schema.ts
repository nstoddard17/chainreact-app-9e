import { NodeComponent } from "../../../types"

export const deleteRowActionSchema: NodeComponent = {
  type: "google_sheets_action_delete_row",
  title: "Delete Row",
  description: "Delete a specific row from a sheet",
  icon: "Trash2" as any,
  isTrigger: false,
  providerId: "google-sheets",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "deletedRow", label: "Deleted Row Number", type: "number", description: "The row that was deleted" },
    { name: "success", label: "Success", type: "boolean", description: "Whether the deletion succeeded" }
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
      name: "rowNumber",
      label: "Row Number",
      type: "number",
      required: true,
      placeholder: "2",
      min: 1,
      supportsAI: true,
      description: "Row number to delete",
      tooltip: "WARNING: This permanently deletes the row"
    }
  ]
}
