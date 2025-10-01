import { FileSpreadsheet, Plus, Edit, List, Search, Trash2 } from "lucide-react"
import { NodeComponent } from "../../types"

export const microsoftExcelNodes: NodeComponent[] = [
  {
    type: "microsoft_excel_trigger_new_row",
    title: "New Row",
    description: "Triggers when a new row is added to an Excel worksheet",
    icon: FileSpreadsheet,
    providerId: "microsoft-excel",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    requiredIntegration: "onedrive", // Requires OneDrive connection for Graph API access
    configSchema: [
      {
        name: "workbookId",
        label: "Workbook",
        type: "select",
        dynamic: "microsoft-excel_workbooks",
        required: true,
        loadOnMount: true,
        placeholder: "Select a workbook",
        description: "Choose a workbook from your OneDrive account"
      },
      {
        name: "worksheetName",
        label: "Worksheet Name",
        type: "select",
        dynamic: "microsoft-excel_worksheets",
        required: true,
        dependsOn: "workbookId",
        placeholder: "Select a worksheet",
        description: "The specific worksheet (tab) within the workbook"
      },
    ],
  },
  {
    type: "microsoft_excel_trigger_new_worksheet",
    title: "New Worksheet",
    description: "Triggers when a new worksheet is created in a workbook",
    icon: FileSpreadsheet,
    providerId: "microsoft-excel",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    requiredIntegration: "onedrive",
    configSchema: [
      {
        name: "workbookId",
        label: "Workbook",
        type: "select",
        dynamic: "microsoft-excel_workbooks",
        required: true,
        loadOnMount: true,
        placeholder: "Select a workbook",
        description: "Choose a workbook from your OneDrive account"
      },
    ],
  },
  {
    type: "microsoft_excel_trigger_updated_row",
    title: "Updated Row in Worksheet",
    description: "Triggers when a row is updated in an Excel worksheet",
    icon: FileSpreadsheet,
    isTrigger: true,
    providerId: "microsoft-excel",
    category: "Productivity",
    producesOutput: true,
    requiredIntegration: "onedrive",
    configSchema: [
      {
        name: "workbookId",
        label: "Workbook",
        type: "select",
        dynamic: "microsoft-excel_workbooks",
        required: true,
        loadOnMount: true,
        placeholder: "Select a workbook",
        description: "Choose a workbook from your OneDrive account"
      },
      {
        name: "worksheetName",
        label: "Worksheet Name",
        type: "select",
        dynamic: "microsoft-excel_worksheets",
        required: true,
        dependsOn: "workbookId",
        placeholder: "Select a worksheet",
        description: "The specific worksheet (tab) within the workbook"
      },
    ],
  },
  {
    type: "microsoft_excel_action_create_workbook",
    title: "Create New Workbook",
    description: "Creates a new Microsoft Excel workbook with customizable properties",
    icon: Plus,
    isTrigger: false,
    providerId: "microsoft-excel",
    requiredIntegration: "onedrive",
    requiredScopes: ["https://graph.microsoft.com/Files.ReadWrite.All"],
    category: "Productivity",
    configSchema: [
      {
        name: "title",
        label: "Workbook Title",
        type: "text",
        required: true,
        placeholder: "e.g., Sales Report 2024, Project Tracker",
        description: "The name of the new workbook"
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        required: false,
        placeholder: "Optional description of the workbook",
        description: "A brief description of what this workbook is for"
      },
      {
        name: "folderPath",
        label: "Folder",
        type: "select",
        dynamic: "microsoft-excel_folders",
        required: false,
        placeholder: "Select folder (optional)",
        description: "OneDrive folder to save the workbook in"
      },
      {
        name: "worksheets",
        label: "Worksheets",
        type: "custom",
        required: false,
        description: "Configure multiple worksheets for your workbook"
      },
      {
        name: "template",
        label: "Template",
        type: "select",
        required: false,
        options: [
          { value: "blank", label: "Blank Workbook" },
          { value: "budget", label: "Budget Tracker" },
          { value: "project", label: "Project Management" },
          { value: "crm", label: "Customer Database" },
          { value: "inventory", label: "Inventory Management" },
          { value: "calendar", label: "Content Calendar" }
        ],
        defaultValue: "blank",
        description: "Start with a pre-built template or blank workbook"
      },
      {
        name: "initialData",
        label: "Pre-fill Sheet1 with Data (Optional)",
        type: "textarea",
        required: false,
        placeholder: "Example:\nName,Age,City\nJohn,30,NYC\nJane,25,LA",
        description: "Add starting data to the first worksheet. Paste data in CSV format (values separated by commas, rows separated by line breaks)",
        helpText: "Format: Use commas to separate columns and new lines to separate rows. First row can be headers."
      }
    ],
    outputSchema: [
      {
        name: "workbookId",
        label: "Workbook ID",
        type: "string",
        description: "The unique ID of the created workbook"
      },
      {
        name: "workbookUrl",
        label: "Workbook URL",
        type: "string",
        description: "Direct link to open the workbook in Excel Online"
      },
      {
        name: "title",
        label: "Title",
        type: "string",
        description: "The title of the created workbook"
      },
      {
        name: "worksheetsCreated",
        label: "Worksheets Created",
        type: "number",
        description: "Number of worksheets created in the workbook"
      }
    ]
  },
  {
    type: "microsoft_excel_unified_action",
    title: "Manage Excel Data",
    description: "Add, update, or remove data in Microsoft Excel with visual column mapping",
    icon: FileSpreadsheet,
    isTrigger: false,
    providerId: "microsoft-excel",
    testable: true,
    requiredIntegration: "onedrive",
    requiredScopes: ["https://graph.microsoft.com/Files.ReadWrite.All"],
    category: "Productivity",
    outputSchema: [
      {
        name: "action",
        label: "Action Performed",
        type: "string",
        description: "The action that was performed (add, update, or delete)",
        example: "add"
      },
      {
        name: "workbookId",
        label: "Workbook ID",
        type: "string",
        description: "The ID of the workbook that was modified",
        example: "01ABC123DEF456789"
      },
      {
        name: "worksheetName",
        label: "Worksheet Name",
        type: "string",
        description: "The name of the worksheet that was modified",
        example: "Sheet1"
      },
      {
        name: "rowsAffected",
        label: "Rows Affected",
        type: "number",
        description: "The number of rows that were added, updated, or deleted",
        example: 5
      },
      {
        name: "rangeModified",
        label: "Range Modified",
        type: "string",
        description: "The specific range that was modified in A1 notation",
        example: "Sheet1!A2:E6"
      },
      {
        name: "values",
        label: "Data Values",
        type: "array",
        description: "The actual data that was added or updated (not included for delete actions)",
        example: [["John Doe", "john@example.com", "Active"]]
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the action was performed",
        example: "2024-01-15T10:30:00Z"
      },
      {
        name: "message",
        label: "Status Message",
        type: "string",
        description: "A human-readable message about the action performed",
        example: "Successfully added 5 rows to Sheet1"
      }
    ],
    configSchema: [
      // === WORKBOOK AND WORKSHEET SELECTION (ALWAYS VISIBLE) ===
      {
        name: "workbookId",
        label: "Workbook",
        type: "select",
        dynamic: "microsoft-excel_workbooks",
        required: true,
        loadOnMount: true,
        placeholder: "Select a workbook",
        description: "The Excel file you want to work with",
        helpText: "Start typing to search through your workbooks"
      },
      {
        name: "worksheetName",
        label: "Worksheet",
        type: "select",
        dynamic: "microsoft-excel_worksheets",
        required: true,
        dependsOn: "workbookId",
        placeholder: "Select a worksheet",
        description: "The specific worksheet (tab) within the workbook",
        helpText: "Select which worksheet tab to work with"
      },

      // === ACTION SELECTION (VISIBLE AFTER WORKSHEET SELECTION) ===
      {
        name: "action",
        label: "What do you want to do?",
        type: "select",
        required: true,
        dependsOn: "worksheetName",
        placeholder: "Select an action...",
        options: [
          { value: "add", label: "➕ Add new row" },
          { value: "update", label: "✏️ Update existing row" },
          { value: "delete", label: "🗑️ Delete row" }
        ],
        description: "Choose what action to perform on the workbook",
        helpText: "Add: Creates a new row in your worksheet. Update: Changes data in existing rows. Delete: Removes rows permanently."
      },

      // === ADD ROW FIELDS ===
      {
        name: "insertPosition",
        label: "Insert Position",
        type: "select",
        required: false,
        hidden: true,
        showIf: (values: any) => values.action === "add",
        options: [
          { value: "append", label: "Append at the end" },
          { value: "prepend", label: "Insert at the beginning (after headers)" },
          { value: "specific_row", label: "Insert at specific row" }
        ],
        defaultValue: "append",
        description: "Where to insert the new row",
        helpText: "Choose where in the worksheet to add the new row"
      },
      {
        name: "specificRow",
        label: "Row Number",
        type: "number",
        required: false,
        hidden: true,
        showIf: (values: any) => values.action === "add" && values.insertPosition === "specific_row",
        placeholder: "Enter row number",
        description: "The specific row number to insert at",
        min: 2,
        helpText: "Row 1 is usually headers, so data starts at row 2"
      },
      {
        name: "columnMapping",
        label: "What Data to Add",
        type: "microsoft_excel_column_mapper",
        required: true,
        hidden: true,
        showIf: (values: any) => values.action === "add",
        dependsOn: "worksheetName",
        description: "Choose which data goes into which columns",
        helpText: "Select a column from your worksheet, then choose what data from your workflow should go there. For example, put the 'Email' from your trigger into the 'Email Address' column."
      },

      // === UPDATE ROW FIELDS ===
      {
        name: "updateRowNumber",
        label: "Selected Row Number",
        type: "number",
        required: false,
        hidden: true,
        showIf: (values: any) => false,
        description: "The row number selected from the preview table"
      },

      // === DELETE ROW FIELDS ===
      {
        name: "deleteRowBy",
        label: "Find Row By",
        type: "select",
        required: true,
        hidden: true,
        showIf: (values: any) => values.action === "delete",
        options: [
          { value: "row_number", label: "Row number" },
          { value: "column_value", label: "Column value" },
          { value: "range", label: "Row range" }
        ],
        description: "How to identify which row(s) to delete",
        helpText: "Row number: Delete a specific row. Column value: Find and delete row where a column contains a specific value. Row range: Delete multiple consecutive rows."
      },
      {
        name: "deleteRowNumber",
        label: "Row Number",
        type: "number",
        required: true,
        hidden: true,
        showIf: (values: any) => values.action === "delete" && values.deleteRowBy === "row_number",
        placeholder: "Enter row number (e.g. 5)",
        min: 2,
        description: "The row number to delete (2 = first data row)",
        helpText: "Row 1 is usually headers, so data starts at row 2"
      },
      // === DATA PREVIEW (Shows for update or delete by column) ===
      {
        name: "dataPreview",
        label: "Worksheet Preview",
        type: "microsoft_excel_data_preview",
        required: false,
        hidden: true,
        showIf: (values: any) => values.worksheetName && (values.action === "update" || (values.action === "delete" && values.deleteRowBy === "column_value")),
        dependsOn: "worksheetName",
        description: "Preview of your worksheet data",
        helpText: "This shows you the first few rows of your worksheet to help you understand the column structure and data types"
      },

      {
        name: "startRow",
        label: "Start Row",
        type: "number",
        required: true,
        hidden: true,
        showIf: (values: any) => values.action === "delete" && values.deleteRowBy === "range",
        placeholder: "Enter start row number",
        description: "First row to delete in range",
        min: 2,
        helpText: "The first row number in the range to delete"
      },
      {
        name: "endRow",
        label: "End Row",
        type: "number",
        required: true,
        hidden: true,
        showIf: (values: any) => values.action === "delete" && values.deleteRowBy === "range",
        placeholder: "Enter end row number",
        description: "Last row to delete in range",
        min: 2,
        helpText: "The last row number in the range to delete (inclusive)"
      }
    ],
  },
  {
    type: "microsoft-excel_action_export_sheet",
    title: "Export Worksheet",
    description: "Export and filter data from a Microsoft Excel worksheet",
    icon: Search,
    providerId: "microsoft-excel",
    requiredIntegration: "onedrive",
    requiredScopes: ["https://graph.microsoft.com/Files.ReadWrite.All"],
    category: "Productivity",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "workbookId",
        label: "Workbook",
        type: "select",
        dynamic: "microsoft-excel_workbooks",
        required: true,
        placeholder: "Select a workbook",
        description: "The Excel file to export from"
      },
      {
        name: "worksheetName",
        label: "Worksheet",
        type: "select",
        dynamic: "microsoft-excel_worksheets",
        required: true,
        dependsOn: "workbookId",
        placeholder: "Select a worksheet",
        description: "The specific worksheet (tab) to export"
      },
      {
        name: "keywordSearch",
        label: "Keyword Search",
        type: "text",
        required: false,
        placeholder: "Search across all columns...",
        description: "Search for keywords across all text columns in the worksheet"
      },
      {
        name: "filterColumn",
        label: "Filter by Column",
        type: "select",
        dynamic: "microsoft-excel_columns",
        required: false,
        placeholder: "Select column to filter by...",
        description: "Choose a column to filter rows by",
        dependsOn: "worksheetName"
      },
      {
        name: "filterOperator",
        label: "Filter Operator",
        type: "select",
        required: false,
        options: [
          { value: "equals", label: "Equals" },
          { value: "not_equals", label: "Not Equals" },
          { value: "contains", label: "Contains" },
          { value: "not_contains", label: "Does Not Contain" },
          { value: "starts_with", label: "Starts With" },
          { value: "ends_with", label: "Ends With" },
          { value: "greater_than", label: "Greater Than" },
          { value: "less_than", label: "Less Than" },
          { value: "greater_equal", label: "Greater Than or Equal" },
          { value: "less_equal", label: "Less Than or Equal" },
          { value: "is_empty", label: "Is Empty" },
          { value: "is_not_empty", label: "Is Not Empty" }
        ],
        defaultValue: "equals",
        description: "How to compare the filter value",
        dependsOn: "filterColumn",
        showWhen: { filterColumn: "!empty" }
      },
      {
        name: "filterValue",
        label: "Filter Value",
        type: "select",
        dynamic: "microsoft-excel_column_values",
        required: false,
        placeholder: "Select or enter value...",
        description: "Choose the value to filter by",
        dependsOn: "filterColumn",
        showWhen: {
          filterColumn: "!empty",
          filterOperator: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "greater_than", "less_than", "greater_equal", "less_equal"]
        }
      },
      {
        name: "sortColumn",
        label: "Sort by Column",
        type: "select",
        dynamic: "microsoft-excel_columns",
        required: false,
        placeholder: "Select column to sort by...",
        description: "Choose a column to sort results by",
        dependsOn: "worksheetName"
      },
      {
        name: "sortOrder",
        label: "Sort Order",
        type: "select",
        required: false,
        options: [
          { value: "asc", label: "Ascending (A to Z, 0 to 9)" },
          { value: "desc", label: "Descending (Z to A, 9 to 0)" }
        ],
        defaultValue: "asc",
        description: "Order to sort the results",
        dependsOn: "sortColumn",
        showWhen: { sortColumn: "!empty" }
      },
      {
        name: "recordLimit",
        label: "Row Limit",
        type: "select",
        required: false,
        options: [
          { value: "", label: "No limit" },
          { value: "10", label: "First 10 Rows" },
          { value: "25", label: "First 25 Rows" },
          { value: "50", label: "First 50 Rows" },
          { value: "100", label: "First 100 Rows" },
          { value: "250", label: "First 250 Rows" },
          { value: "500", label: "First 500 Rows" },
          { value: "custom", label: "Custom Amount" }
        ],
        placeholder: "Select row limit...",
        description: "Limit the number of rows returned"
      },
      {
        name: "maxRows",
        label: "Max Rows",
        type: "number",
        required: false,
        defaultValue: 100,
        placeholder: "100",
        description: "Maximum number of rows to return",
        dependsOn: "recordLimit",
        showWhen: { recordLimit: "custom" },
        min: 1,
        max: 10000
      },
      {
        name: "includeHeaders",
        label: "Include Headers",
        type: "boolean",
        required: false,
        defaultValue: true,
        description: "Include column headers in the result"
      },
      {
        name: "outputFormat",
        label: "Output Format",
        type: "select",
        required: false,
        options: [
          { value: "objects", label: "Objects (Key-Value pairs)" },
          { value: "arrays", label: "Arrays (Raw values)" },
          { value: "csv", label: "CSV String" },
          { value: "json", label: "JSON String" }
        ],
        defaultValue: "objects",
        description: "How to format the output data"
      },
      {
        name: "range",
        label: "Custom Range (Advanced)",
        type: "text",
        required: false,
        placeholder: "e.g., A1:E10, A:A, 2:5",
        description: "Specify a custom range using A1 notation",
        advanced: true
      }
    ],
    outputSchema: [
      {
        name: "rows",
        label: "Rows",
        type: "array",
        description: "The rows that match the filter criteria"
      },
      {
        name: "rowCount",
        label: "Row Count",
        type: "number",
        description: "Number of rows returned"
      },
      {
        name: "totalRows",
        label: "Total Rows",
        type: "number",
        description: "Total number of rows in the worksheet"
      },
      {
        name: "headers",
        label: "Headers",
        type: "array",
        description: "Column headers from the worksheet"
      },
      {
        name: "range",
        label: "Range",
        type: "string",
        description: "The range that was queried"
      }
    ]
  }
]