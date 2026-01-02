import { NodeComponent } from "../../../types"

export const batchUpdateActionSchema: NodeComponent = {
  type: "google_sheets_action_batch_update",
  title: "Batch Update Cells",
  description: "Update multiple cells at once - great for updating several values in one action",
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
      placeholder: "Select a spreadsheet",
      loadingPlaceholder: "Loading spreadsheets...",
      description: "Choose a spreadsheet from your Google Sheets account"
    },
    {
      name: "inputMode",
      label: "Input Mode",
      type: "select",
      required: true,
      defaultValue: "simple",
      dependsOn: "spreadsheetId",
      hidden: {
        $deps: ["spreadsheetId"],
        $condition: { spreadsheetId: { $exists: false } }
      },
      options: [
        { value: "simple", label: "Simple (Cell + Value pairs)" },
        { value: "json", label: "Advanced (JSON format)" }
      ],
      description: "Choose how to specify the updates"
    },
    // Simple mode: Sheet selector
    {
      name: "sheetName",
      label: "Sheet",
      type: "select",
      dynamic: "google-sheets_sheets",
      required: false,
      dependsOn: "spreadsheetId",
      hidden: {
        $deps: ["spreadsheetId", "inputMode"],
        $condition: {
          $or: [
            { spreadsheetId: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "Select a sheet",
      loadingPlaceholder: "Loading sheets...",
      description: "The specific sheet (tab) to update"
    },
    // JSON mode
    {
      name: "updates",
      label: "Updates (JSON)",
      type: "textarea",
      required: false,
      dependsOn: "inputMode",
      hidden: {
        $deps: ["spreadsheetId", "inputMode"],
        $condition: {
          $or: [
            { spreadsheetId: { $exists: false } },
            { inputMode: { $ne: "json" } }
          ]
        }
      },
      rows: 10,
      placeholder: JSON.stringify([
        { range: "Sheet1!A1", values: [["Updated Value"]] },
        { range: "Sheet1!B2:C3", values: [["V1", "V2"], ["V3", "V4"]] }
      ], null, 2),
      supportsAI: true,
      description: "JSON array of updates. Each needs 'range' (Sheet!A1 notation) and 'values' (2D array)"
    },
    // Simple mode: Cell/Value pairs
    {
      name: "cell1",
      label: "Cell 1",
      type: "text",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "A1",
      description: "First cell to update (e.g., A1, B5, C10)"
    },
    {
      name: "value1",
      label: "Value 1",
      type: "text",
      required: false,
      dependsOn: "cell1",
      hidden: {
        $deps: ["sheetName", "cell1", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { cell1: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "Enter value...",
      supportsAI: true,
      description: "Value to set in Cell 1"
    },
    {
      name: "cell2",
      label: "Cell 2",
      type: "text",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "B1 (optional)",
      description: "Second cell to update"
    },
    {
      name: "value2",
      label: "Value 2",
      type: "text",
      required: false,
      dependsOn: "cell2",
      hidden: {
        $deps: ["sheetName", "cell2", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { cell2: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "Enter value...",
      supportsAI: true,
      description: "Value to set in Cell 2"
    },
    {
      name: "cell3",
      label: "Cell 3",
      type: "text",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "C1 (optional)",
      description: "Third cell to update"
    },
    {
      name: "value3",
      label: "Value 3",
      type: "text",
      required: false,
      dependsOn: "cell3",
      hidden: {
        $deps: ["sheetName", "cell3", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { cell3: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "Enter value...",
      supportsAI: true,
      description: "Value to set in Cell 3"
    },
    {
      name: "cell4",
      label: "Cell 4",
      type: "text",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "D1 (optional)",
      description: "Fourth cell to update"
    },
    {
      name: "value4",
      label: "Value 4",
      type: "text",
      required: false,
      dependsOn: "cell4",
      hidden: {
        $deps: ["sheetName", "cell4", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { cell4: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "Enter value...",
      supportsAI: true,
      description: "Value to set in Cell 4"
    },
    {
      name: "cell5",
      label: "Cell 5",
      type: "text",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "E1 (optional)",
      description: "Fifth cell to update"
    },
    {
      name: "value5",
      label: "Value 5",
      type: "text",
      required: false,
      dependsOn: "cell5",
      hidden: {
        $deps: ["sheetName", "cell5", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { cell5: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "Enter value...",
      supportsAI: true,
      description: "Value to set in Cell 5"
    },
    {
      name: "cell6",
      label: "Cell 6",
      type: "text",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "F1 (optional)"
    },
    {
      name: "value6",
      label: "Value 6",
      type: "text",
      required: false,
      dependsOn: "cell6",
      hidden: {
        $deps: ["sheetName", "cell6", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { cell6: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "Enter value...",
      supportsAI: true
    },
    {
      name: "cell7",
      label: "Cell 7",
      type: "text",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "G1 (optional)"
    },
    {
      name: "value7",
      label: "Value 7",
      type: "text",
      required: false,
      dependsOn: "cell7",
      hidden: {
        $deps: ["sheetName", "cell7", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { cell7: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "Enter value...",
      supportsAI: true
    },
    {
      name: "cell8",
      label: "Cell 8",
      type: "text",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "H1 (optional)"
    },
    {
      name: "value8",
      label: "Value 8",
      type: "text",
      required: false,
      dependsOn: "cell8",
      hidden: {
        $deps: ["sheetName", "cell8", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { cell8: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "Enter value...",
      supportsAI: true
    },
    {
      name: "cell9",
      label: "Cell 9",
      type: "text",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "I1 (optional)"
    },
    {
      name: "value9",
      label: "Value 9",
      type: "text",
      required: false,
      dependsOn: "cell9",
      hidden: {
        $deps: ["sheetName", "cell9", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { cell9: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "Enter value...",
      supportsAI: true
    },
    {
      name: "cell10",
      label: "Cell 10",
      type: "text",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "J1 (optional)"
    },
    {
      name: "value10",
      label: "Value 10",
      type: "text",
      required: false,
      dependsOn: "cell10",
      hidden: {
        $deps: ["sheetName", "cell10", "inputMode"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { cell10: { $exists: false } },
            { inputMode: { $eq: "json" } }
          ]
        }
      },
      placeholder: "Enter value...",
      supportsAI: true
    }
  ]
}
