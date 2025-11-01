import { NodeComponent } from "../../../types"

export const batchUpdateActionSchema: NodeComponent = {
  type: "google_sheets_action_batch_update",
  title: "Batch Update",
  description: "Update multiple ranges in a single operation",
  icon: "Edit" as any,
  isTrigger: false,
  providerId: "google-sheets",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "updatedRanges", label: "Updated Ranges", type: "array", description: "List of ranges that were updated" },
    { name: "totalCellsUpdated", label: "Total Cells Updated", type: "number", description: "Total number of cells modified" },
    { name: "success", label: "Success", type: "boolean", description: "Whether all updates succeeded" }
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
      name: "updates",
      label: "Updates",
      type: "textarea",
      required: true,
      rows: 10,
      placeholder: JSON.stringify([
        { range: "Sheet1!A1", values: [["Updated Value"]] },
        { range: "Sheet1!B2:C3", values: [["V1", "V2"], ["V3", "V4"]] }
      ], null, 2),
      supportsAI: true,
      description: "Array of range updates with values",
      tooltip: "Each update object needs 'range' (A1 notation) and 'values' (2D array)"
    }
  ]
}
