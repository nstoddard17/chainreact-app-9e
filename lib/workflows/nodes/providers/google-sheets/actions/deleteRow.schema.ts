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
      name: "rowSelection",
      label: "Row Selection",
      type: "select",
      required: true,
      defaultValue: "specific",
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      options: [
        { value: "specific", label: "Specific Row Number" },
        { value: "last", label: "Last Row" },
        { value: "first_data", label: "First Data Row (Row 2)" }
      ],
      description: "Choose how to select the row to delete"
    },
    {
      name: "rowNumber",
      label: "Row Number",
      type: "number",
      required: true,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "rowSelection"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { rowSelection: { $ne: "specific" } }
          ]
        }
      },
      placeholder: "2",
      min: 1,
      supportsAI: true,
      description: "Row number to delete",
      tooltip: "WARNING: This permanently deletes the row"
    }
  ]
}
