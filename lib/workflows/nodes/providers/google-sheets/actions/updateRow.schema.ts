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
      description: "Row number to update"
    },
    {
      name: "values",
      label: "New Values",
      type: "textarea",
      required: true,
      rows: 4,
      placeholder: JSON.stringify(["Value 1", "Value 2", "Value 3"], null, 2),
      supportsAI: true,
      description: "Array of new values for the row"
    }
  ]
}
