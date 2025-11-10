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
      name: "updateMode",
      label: "Update Mode",
      type: "select",
      required: true,
      defaultValue: "simple",
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      options: [
        { value: "simple", label: "Simple - Use Variables (for automation)" },
        { value: "visual", label: "Visual - Select & Edit Row" }
      ],
      description: "Choose how to configure the update"
    },
    {
      name: "rowSelection",
      label: "Row Selection",
      type: "select",
      required: true,
      defaultValue: "specific",
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "updateMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { updateMode: { $eq: "visual" } }
          ]
        }
      },
      options: [
        { value: "specific", label: "Specific Row Number" },
        { value: "last", label: "Last Row" },
        { value: "first_data", label: "First Data Row (Row 2)" }
      ],
      description: "Choose how to select the row to update"
    },
    {
      name: "rowNumber",
      label: "Row Number",
      type: "number",
      required: true,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "updateMode", "rowSelection"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { updateMode: { $eq: "visual" } },
            { rowSelection: { $ne: "specific" } }
          ]
        }
      },
      placeholder: "2",
      min: 1,
      supportsAI: true,
      description: "Row number to update (e.g., {{trigger.rowNumber}})"
    },
    {
      name: "values",
      label: "New Values",
      type: "textarea",
      required: true,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "updateMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { updateMode: { $eq: "visual" } }
          ]
        }
      },
      rows: 6,
      placeholder: JSON.stringify(["Value 1", "Value 2", "Value 3"], null, 2),
      supportsAI: true,
      description: "Array of new values for the row (e.g., {{trigger.values}})"
    },
    {
      name: "updateRowPreview",
      label: "Update Row",
      type: "google_sheets_update_row_preview",
      required: false,
      dependsOn: "updateMode",
      hidden: {
        $deps: ["updateMode"],
        $condition: { updateMode: { $ne: "visual" } }
      },
      description: "Select a row and update its column values"
    }
  ]
}
