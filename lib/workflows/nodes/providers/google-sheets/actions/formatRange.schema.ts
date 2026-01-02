import { NodeComponent } from "../../../types"

export const formatRangeActionSchema: NodeComponent = {
  type: "google_sheets_action_format_range",
  title: "Format Range",
  description: "Apply formatting to cells (colors, borders, alignment, etc.)",
  icon: "Palette" as any,
  isTrigger: false,
  providerId: "google-sheets",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "formattedRange", label: "Formatted Range", type: "string", description: "The range that was formatted" },
    { name: "success", label: "Success", type: "boolean", description: "Whether formatting succeeded" }
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
      name: "rangeSelection",
      label: "Range Selection",
      type: "select",
      required: true,
      defaultValue: "custom",
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      options: [
        { value: "custom", label: "Custom Range" },
        { value: "entire_sheet", label: "Entire Sheet" },
        { value: "header_row", label: "Header Row (Row 1)" },
        { value: "first_data_row", label: "First Data Row (Row 2)" },
        { value: "last_row", label: "Last Row" }
      ],
      description: "Choose a predefined range or enter a custom range"
    },
    {
      name: "range",
      label: "Custom Range",
      type: "text",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName", "rangeSelection"],
        $condition: {
          $or: [
            { sheetName: { $exists: false } },
            { rangeSelection: { $ne: "custom" } }
          ]
        }
      },
      placeholder: "A1:D10",
      supportsAI: true,
      description: "Range in A1 notation (e.g., A1:D10 or {{trigger.range}})"
    },
    {
      name: "backgroundColor",
      label: "Background Color",
      type: "select",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      options: [
        { value: "", label: "No change" },
        { value: "#ffffff", label: "White" },
        { value: "#000000", label: "Black" },
        { value: "#f3f3f3", label: "Light Gray 3" },
        { value: "#d9d9d9", label: "Light Gray 2" },
        { value: "#999999", label: "Gray" },
        { value: "#666666", label: "Dark Gray" },
        { value: "#ea4335", label: "Red" },
        { value: "#fbbc04", label: "Yellow" },
        { value: "#34a853", label: "Green" },
        { value: "#4285f4", label: "Blue" },
        { value: "#ff6d01", label: "Orange" },
        { value: "#46bdc6", label: "Cyan" },
        { value: "#7baaf7", label: "Light Blue" },
        { value: "#f07b72", label: "Light Red" },
        { value: "#fce8b2", label: "Light Yellow" },
        { value: "#b7e1cd", label: "Light Green" },
        { value: "#a4c2f4", label: "Pale Blue" },
        { value: "#d5a6bd", label: "Light Purple" },
        { value: "#9900ff", label: "Purple" },
        { value: "#ff00ff", label: "Magenta" },
        { value: "#674ea7", label: "Dark Purple" }
      ],
      description: "Cell background color"
    },
    {
      name: "textColor",
      label: "Text Color",
      type: "select",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      options: [
        { value: "", label: "No change" },
        { value: "#000000", label: "Black" },
        { value: "#ffffff", label: "White" },
        { value: "#666666", label: "Dark Gray" },
        { value: "#999999", label: "Gray" },
        { value: "#ea4335", label: "Red" },
        { value: "#fbbc04", label: "Yellow" },
        { value: "#34a853", label: "Green" },
        { value: "#4285f4", label: "Blue" },
        { value: "#ff6d01", label: "Orange" },
        { value: "#9900ff", label: "Purple" },
        { value: "#ff00ff", label: "Magenta" },
        { value: "#674ea7", label: "Dark Purple" },
        { value: "#0b5394", label: "Dark Blue" },
        { value: "#38761d", label: "Dark Green" },
        { value: "#990000", label: "Dark Red" }
      ],
      description: "Text color"
    },
    {
      name: "bold",
      label: "Bold",
      type: "boolean",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      description: "Make text bold"
    },
    {
      name: "italic",
      label: "Italic",
      type: "boolean",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      description: "Make text italic"
    },
    {
      name: "fontSize",
      label: "Font Size",
      type: "number",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      min: 6,
      max: 72,
      placeholder: "11",
      description: "Font size in points"
    },
    {
      name: "horizontalAlignment",
      label: "Horizontal Alignment",
      type: "select",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      options: [
        { value: "LEFT", label: "Left" },
        { value: "CENTER", label: "Center" },
        { value: "RIGHT", label: "Right" }
      ],
      description: "Horizontal text alignment"
    },
    {
      name: "verticalAlignment",
      label: "Vertical Alignment",
      type: "select",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      options: [
        { value: "TOP", label: "Top" },
        { value: "MIDDLE", label: "Middle" },
        { value: "BOTTOM", label: "Bottom" }
      ],
      description: "Vertical text alignment"
    },
    {
      name: "textWrapping",
      label: "Text Wrapping",
      type: "select",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      options: [
        { value: "OVERFLOW_CELL", label: "Overflow" },
        { value: "WRAP", label: "Wrap" },
        { value: "CLIP", label: "Clip" }
      ],
      description: "How to handle text that doesn't fit in the cell"
    },
    {
      name: "strikethrough",
      label: "Strikethrough",
      type: "boolean",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      description: "Apply strikethrough to text"
    },
    {
      name: "underline",
      label: "Underline",
      type: "boolean",
      required: false,
      dependsOn: "sheetName",
      hidden: {
        $deps: ["sheetName"],
        $condition: { sheetName: { $exists: false } }
      },
      description: "Underline text"
    }
  ]
}
