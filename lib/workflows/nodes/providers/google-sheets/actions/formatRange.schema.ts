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
      name: "range",
      label: "Range to Format",
      type: "text",
      required: true,
      placeholder: "A1:D10",
      supportsAI: true,
      description: "Range in A1 notation"
    },
    {
      name: "backgroundColor",
      label: "Background Color",
      type: "color",
      required: false,
      description: "Cell background color"
    },
    {
      name: "textColor",
      label: "Text Color",
      type: "color",
      required: false,
      description: "Text color"
    },
    {
      name: "bold",
      label: "Bold",
      type: "boolean",
      required: false,
      description: "Make text bold"
    },
    {
      name: "italic",
      label: "Italic",
      type: "boolean",
      required: false,
      description: "Make text italic"
    },
    {
      name: "fontSize",
      label: "Font Size",
      type: "number",
      required: false,
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
      options: [
        { value: "LEFT", label: "Left" },
        { value: "CENTER", label: "Center" },
        { value: "RIGHT", label: "Right" }
      ],
      description: "Horizontal text alignment"
    }
  ]
}
