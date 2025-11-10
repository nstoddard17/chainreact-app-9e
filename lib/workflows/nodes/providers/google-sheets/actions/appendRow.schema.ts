import { NodeComponent } from "../../../types"

export const appendRowActionSchema: NodeComponent = {
  type: "google_sheets_action_append_row",
  title: "Add Row",
  description: "Add a new row to a sheet at any position",
  icon: "Plus" as any,
  isTrigger: false,
  providerId: "google-sheets",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "rowNumber", label: "Row Number", type: "number", description: "The row number where data was added" },
    { name: "range", label: "Range", type: "string", description: "The range where data was written" },
    { name: "valuesWritten", label: "Values Written", type: "array", description: "The values that were written" }
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
      placeholder: "Select a sheet",
      loadingPlaceholder: "Loading sheets...",
      description: "The specific sheet (tab) within the spreadsheet"
    },
    {
      name: "sheetPreview",
      label: "Sheet Preview",
      type: "google_sheets_add_row_preview",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      description: "Preview your spreadsheet and select where to insert the new row"
    },
    {
      name: "insertPosition",
      label: "Insert Position",
      type: "hidden",
      required: false,
      defaultValue: "append"
    },
    {
      name: "rowNumber",
      label: "Row Number",
      type: "hidden",
      required: false
    },
    {
      name: "rowFields",
      label: "Row Fields",
      type: "google_sheets_add_row_fields",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      description: "Enter values for each column in your sheet"
    }
  ]
}
