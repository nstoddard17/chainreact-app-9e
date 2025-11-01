import { NodeComponent } from "../../../types"

export const appendRowActionSchema: NodeComponent = {
  type: "google_sheets_action_append_row",
  title: "Append Row",
  description: "Add a new row to the end of a sheet",
  icon: "Plus" as any,
  isTrigger: false,
  providerId: "google-sheets",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "rowNumber", label: "Row Number", type: "number", description: "The row number where data was appended" },
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
      name: "values",
      label: "Row Values",
      type: "textarea",
      required: true,
      rows: 4,
      placeholder: JSON.stringify(["Value 1", "Value 2", "Value 3"], null, 2),
      supportsAI: true,
      description: "Array of values for the new row",
      tooltip: "Enter values as JSON array. Example: [\"Name\", \"Email\", \"Status\"]"
    }
  ]
}
