import { FileSpreadsheet, Plus, Edit, List, Search, Trash2, GitMerge, FilePlus } from "lucide-react"
import { NodeComponent } from "../../types"

export const microsoftExcelNodes: NodeComponent[] = [
  {
    type: "microsoft_excel_trigger_new_row",
    title: "New Row in Worksheet",
    description: "Triggers when a new row is added to an Excel worksheet",
    icon: FileSpreadsheet,
    providerId: "microsoft-excel",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    requiredIntegration: "microsoft-excel", // Requires Microsoft Excel connection for Graph API access
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
    outputSchema: [
      {
        name: "rowIndex",
        label: "Row Index",
        type: "number",
        description: "The index/number of the new row"
      },
      {
        name: "values",
        label: "Row Values",
        type: "array",
        description: "Array of cell values in the new row"
      },
      {
        name: "rowData",
        label: "Row Data",
        type: "object",
        description: "Row data as key-value pairs (column headers as keys)"
      },
      {
        name: "worksheetName",
        label: "Worksheet Name",
        type: "string",
        description: "Name of the worksheet where row was added"
      },
      {
        name: "workbookId",
        label: "Workbook ID",
        type: "string",
        description: "ID of the workbook"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "ISO timestamp when the row was added"
      }
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
    requiredIntegration: "microsoft-excel",
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
    outputSchema: [
      {
        name: "worksheetId",
        label: "Worksheet ID",
        type: "string",
        description: "Unique identifier for the new worksheet"
      },
      {
        name: "worksheetName",
        label: "Worksheet Name",
        type: "string",
        description: "Name of the new worksheet"
      },
      {
        name: "position",
        label: "Position",
        type: "number",
        description: "Position/index of the worksheet in the workbook"
      },
      {
        name: "workbookId",
        label: "Workbook ID",
        type: "string",
        description: "ID of the workbook"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "ISO timestamp when the worksheet was created"
      }
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
    requiredIntegration: "microsoft-excel",
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
    outputSchema: [
      {
        name: "rowIndex",
        label: "Row Index",
        type: "number",
        description: "The index/number of the updated row"
      },
      {
        name: "values",
        label: "Updated Values",
        type: "array",
        description: "Array of cell values in the updated row"
      },
      {
        name: "rowData",
        label: "Row Data",
        type: "object",
        description: "Updated row data as key-value pairs (column headers as keys)"
      },
      {
        name: "previousValues",
        label: "Previous Values",
        type: "array",
        description: "Array of previous cell values before update"
      },
      {
        name: "changedColumns",
        label: "Changed Columns",
        type: "array",
        description: "List of column names/indices that were changed"
      },
      {
        name: "worksheetName",
        label: "Worksheet Name",
        type: "string",
        description: "Name of the worksheet where row was updated"
      },
      {
        name: "workbookId",
        label: "Workbook ID",
        type: "string",
        description: "ID of the workbook"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "ISO timestamp when the row was updated"
      }
    ],
  },
  {
    type: "microsoft_excel_trigger_new_table_row",
    title: "New Row in Table",
    description: "Triggers when a new row is added to an Excel table",
    icon: List,
    providerId: "microsoft-excel",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    requiredIntegration: "microsoft-excel",
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
        name: "tableName",
        label: "Table",
        type: "select",
        dynamic: "microsoft-excel_tables",
        required: true,
        dependsOn: "workbookId",
        placeholder: "Select a table",
        description: "The Excel table to monitor for new rows"
      },
    ],
    outputSchema: [
      {
        name: "rowIndex",
        label: "Row Index",
        type: "number",
        description: "The index of the new row in the table"
      },
      {
        name: "values",
        label: "Row Values",
        type: "array",
        description: "Array of cell values in the new row"
      },
      {
        name: "rowData",
        label: "Row Data",
        type: "object",
        description: "Row data as key-value pairs (column headers as keys)"
      },
      {
        name: "tableName",
        label: "Table Name",
        type: "string",
        description: "Name of the table where row was added"
      },
      {
        name: "workbookId",
        label: "Workbook ID",
        type: "string",
        description: "ID of the workbook"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "ISO timestamp when the row was added"
      }
    ],
  },
  {
    type: "microsoft_excel_action_create_workbook",
    title: "Create New Workbook",
    description: "Creates a new Microsoft Excel workbook with customizable properties",
    icon: Plus,
    isTrigger: false,
    providerId: "microsoft-excel",
    requiredIntegration: "microsoft-excel",
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
        description: "A brief description of what this workbook is for",
        hasVariablePicker: true,
        hasConnectButton: true
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
        helpText: "Format: Use commas to separate columns and new lines to separate rows. First row can be headers.",
        hasVariablePicker: true,
        hasConnectButton: true
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
  // === ADD NEW ROW ACTION ===
  {
    type: "microsoft_excel_action_add_row",
    title: "Add New Row",
    description: "Add a new row to a Microsoft Excel worksheet",
    icon: Plus,
    isTrigger: false,
    providerId: "microsoft-excel",
    testable: true,
    requiredIntegration: "microsoft-excel",
    requiredScopes: ["https://graph.microsoft.com/Files.ReadWrite.All"],
    category: "Productivity",
    outputSchema: [
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
        name: "range",
        label: "Range Modified",
        type: "string",
        description: "The specific range that was modified in A1 notation",
        example: "Sheet1!A2:E2"
      },
      {
        name: "rowNumber",
        label: "Row Number",
        type: "number",
        description: "The row number where data was added",
        example: 2
      },
      {
        name: "values",
        label: "Data Values",
        type: "array",
        description: "The actual data that was added",
        example: [["John Doe", "john@example.com", "Active"]]
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the action was performed",
        example: "2024-01-15T10:30:00Z"
      }
    ],
    configSchema: [
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
        helpText: "Select which worksheet tab to work with",
        hidden: {
          $deps: ["workbookId"],
          $condition: { workbookId: { $exists: false } }
        }
      },
      {
        name: "insertPosition",
        label: "Insert Position",
        type: "select",
        required: true,
        dependsOn: "worksheetName",
        options: [
          { value: "append", label: "Append at the end" },
          { value: "prepend", label: "Insert at the beginning" },
          { value: "specific_row", label: "Insert at specific row" }
        ],
        defaultValue: "append",
        description: "Where to insert the new row",
        helpText: "Choose where in the worksheet to add the new row",
        hidden: {
          $deps: ["worksheetName"],
          $condition: { worksheetName: { $exists: false } }
        }
      },
      {
        name: "specificRow",
        label: "Row Number",
        type: "number",
        required: true,
        dependsOn: "insertPosition",
        placeholder: "Enter row number (e.g., 2)",
        description: "The row number to insert at",
        min: 1,
        helpText: "Enter the row number where you want to insert the new data",
        hidden: {
          $deps: ["insertPosition"],
          $condition: { insertPosition: { $ne: "specific_row" } }
        }
      },
      {
        name: "hasHeaders",
        label: "Does your worksheet have headers in row 1?",
        type: "select",
        required: true,
        dependsOn: "insertPosition",
        options: [
          { value: "yes", label: "Yes - Use column headers from row 1" },
          { value: "no", label: "No - Use column letters (A, B, C, etc.)" }
        ],
        defaultValue: "yes",
        description: "Whether the first row contains column headers",
        helpText: "If your worksheet has headers in row 1, we'll use those as column names. Otherwise, we'll use column letters.",
        hidden: {
          $deps: ["insertPosition"],
          $condition: { insertPosition: { $exists: false } }
        }
      },
      {
        name: "columnMapping",
        label: "What Data to Add",
        type: "microsoft_excel_column_mapper",
        required: true,
        dependsOn: "hasHeaders",
        description: "Choose which data goes into which columns",
        helpText: "Select a column, then enter the value or use a variable from a previous step.",
        hidden: {
          $deps: ["hasHeaders"],
          $condition: { hasHeaders: { $exists: false } }
        }
      }
    ],
  },

  // === UPDATE ROW ACTION ===
  {
    type: "microsoft_excel_action_update_row",
    title: "Update Row",
    description: "Update an existing row in a Microsoft Excel worksheet",
    icon: Edit,
    isTrigger: false,
    providerId: "microsoft-excel",
    testable: true,
    requiredIntegration: "microsoft-excel",
    requiredScopes: ["https://graph.microsoft.com/Files.ReadWrite.All"],
    category: "Productivity",
    outputSchema: [
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
        name: "rowsUpdated",
        label: "Rows Updated",
        type: "number",
        description: "The number of rows that were updated",
        example: 1
      },
      {
        name: "rowNumbers",
        label: "Row Numbers",
        type: "array",
        description: "The row numbers that were updated",
        example: [5]
      },
      {
        name: "ranges",
        label: "Ranges Modified",
        type: "array",
        description: "The specific cell ranges that were modified",
        example: ["Sheet1!A5", "Sheet1!B5"]
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the action was performed",
        example: "2024-01-15T10:30:00Z"
      }
    ],
    configSchema: [
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
      {
        name: "hasHeaders",
        label: "First row contains headers",
        type: "custom",
        required: false,
        dependsOn: "worksheetName",
        defaultValue: true,
        description: "Whether the first row of the worksheet contains column headers",
        helpText: "If checked, row 1 is treated as headers. If unchecked, row 1 can be updated as data."
      },
      {
        name: "findRowBy",
        label: "Find Row By",
        type: "select",
        required: true,
        dependsOn: "worksheetName",
        options: [
          { value: "row_number", label: "Row number" },
          { value: "column_value", label: "Column value (search)" }
        ],
        description: "How to identify which row to update",
        helpText: "Row number: Update a specific row. Column value: Find row where a column matches a value."
      },
      {
        name: "rowNumber",
        label: "Row Number",
        type: "number",
        required: true,
        dependsOn: "findRowBy",
        hidden: true,
        showIf: (values: any) => values.findRowBy === "row_number",
        placeholder: "Enter row number (e.g. 5)",
        min: 1,
        description: "The row number to update",
        helpText: "Row 1 can be headers or data, depending on your worksheet structure"
      },
      {
        name: "matchColumn",
        label: "Search Column",
        type: "select",
        dynamic: "microsoft-excel_columns",
        required: true,
        dependsOn: "worksheetName",
        hidden: true,
        showIf: (values: any) => values.findRowBy === "column_value",
        placeholder: "Select column to search",
        description: "The column to search for the matching value"
      },
      {
        name: "matchValue",
        label: "Search Value",
        type: "text",
        required: true,
        dependsOn: "matchColumn",
        hidden: true,
        showIf: (values: any) => values.findRowBy === "column_value",
        placeholder: "Enter value to find",
        description: "The value to search for in the column",
        hasVariablePicker: true
      },
      {
        name: "updateMultiple",
        label: "Update All Matches",
        type: "boolean",
        required: false,
        dependsOn: "matchColumn",
        hidden: true,
        showIf: (values: any) => values.findRowBy === "column_value",
        defaultValue: false,
        description: "Update all rows that match (if unchecked, only updates first match)"
      },
      {
        name: "updateMapping",
        label: "Fields to Update",
        type: "custom",
        required: true,
        dependsOn: "worksheetName",
        description: "Choose which columns to update and their new values",
        helpText: "Select columns and provide new values. Only the columns you specify will be updated."
      }
    ],
  },

  // === DELETE ROW ACTION ===
  {
    type: "microsoft_excel_action_delete_row",
    title: "Delete Row",
    description: "Delete a row from a Microsoft Excel worksheet",
    icon: Trash2,
    isTrigger: false,
    providerId: "microsoft-excel",
    testable: true,
    requiredIntegration: "microsoft-excel",
    requiredScopes: ["https://graph.microsoft.com/Files.ReadWrite.All"],
    category: "Productivity",
    outputSchema: [
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
        name: "rowsDeleted",
        label: "Rows Deleted",
        type: "number",
        description: "The number of rows that were deleted",
        example: 1
      },
      {
        name: "range",
        label: "Range Description",
        type: "string",
        description: "Description of what was deleted",
        example: "Row 5"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the action was performed",
        example: "2024-01-15T10:30:00Z"
      }
    ],
    configSchema: [
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
      {
        name: "deleteBy",
        label: "Find Row By",
        type: "select",
        required: true,
        dependsOn: "worksheetName",
        options: [
          { value: "row_number", label: "Row number" },
          { value: "column_value", label: "Column value (search)" },
          { value: "range", label: "Row range" }
        ],
        description: "How to identify which row(s) to delete",
        helpText: "Row number: Delete a specific row. Column value: Find and delete row where a column matches. Row range: Delete multiple consecutive rows."
      },
      {
        name: "rowNumber",
        label: "Row Number",
        type: "number",
        required: true,
        dependsOn: "deleteBy",
        hidden: true,
        showIf: (values: any) => values.deleteBy === "row_number",
        placeholder: "Enter row number (e.g. 5)",
        min: 2,
        description: "The row number to delete (2 = first data row)",
        helpText: "Row 1 is usually headers, so data starts at row 2"
      },
      {
        name: "matchColumn",
        label: "Search Column",
        type: "select",
        dynamic: "microsoft-excel_columns",
        required: true,
        dependsOn: "worksheetName",
        hidden: true,
        showIf: (values: any) => values.deleteBy === "column_value",
        placeholder: "Select column to search",
        description: "The column to search for the matching value"
      },
      {
        name: "matchValue",
        label: "Search Value",
        type: "text",
        required: true,
        dependsOn: "matchColumn",
        hidden: true,
        showIf: (values: any) => values.deleteBy === "column_value",
        placeholder: "Enter value to find",
        description: "The value to search for in the column",
        hasVariablePicker: true
      },
      {
        name: "deleteMultiple",
        label: "Delete All Matches",
        type: "boolean",
        required: false,
        dependsOn: "matchColumn",
        hidden: true,
        showIf: (values: any) => values.deleteBy === "column_value",
        defaultValue: false,
        description: "Delete all rows that match (if unchecked, only deletes first match)"
      },
      {
        name: "startRow",
        label: "Start Row",
        type: "number",
        required: true,
        dependsOn: "deleteBy",
        hidden: true,
        showIf: (values: any) => values.deleteBy === "range",
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
        dependsOn: "deleteBy",
        hidden: true,
        showIf: (values: any) => values.deleteBy === "range",
        placeholder: "Enter end row number",
        description: "Last row to delete in range",
        min: 2,
        helpText: "The last row number in the range to delete (inclusive)"
      },
      {
        name: "confirmDelete",
        label: "Confirm Deletion",
        type: "boolean",
        required: true,
        dependsOn: "worksheetName",
        defaultValue: false,
        description: "Check this box to confirm you want to delete the row(s)",
        helpText: "This is a safety check to prevent accidental deletions"
      }
    ],
  },
  {
    type: "microsoft-excel_action_export_sheet",
    title: "Get Rows",
    description: "Retrieve and filter rows from a Microsoft Excel worksheet",
    icon: Search,
    providerId: "microsoft-excel",
    requiredIntegration: "microsoft-excel",
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
        dependsOn: "worksheetName",
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
        visibilityCondition: { field: "filterColumn", operator: "isNotEmpty" }
      },
      {
        name: "filterValue",
        label: "Filter Value",
        type: "text",
        required: false,
        placeholder: "Enter value to filter by...",
        description: "The value to filter by",
        dependsOn: "filterColumn",
        hasVariablePicker: true,
        visibilityCondition: {
          and: [
            { field: "filterColumn", operator: "isNotEmpty" },
            { field: "filterOperator", operator: "in", value: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "greater_than", "less_than", "greater_equal", "less_equal"] }
          ]
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
        visibilityCondition: { field: "sortColumn", operator: "equals", value: "!empty" }
      },
      {
        name: "recordLimit",
        label: "Row Limit",
        type: "select",
        required: false,
        dependsOn: "worksheetName",
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
        visibilityCondition: { field: "recordLimit", operator: "equals", value: "custom" },
        min: 1,
        max: 10000
      },
      {
        name: "includeHeaders",
        label: "Include Headers",
        type: "boolean",
        required: false,
        dependsOn: "worksheetName",
        defaultValue: true,
        description: "Include column headers in the result"
      },
      {
        name: "outputFormat",
        label: "Output Format",
        type: "select",
        required: false,
        dependsOn: "worksheetName",
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
  },
  {
    type: "microsoft_excel_action_add_table_row",
    title: "Add Row to Table",
    description: "Add a new row to an Excel table with automatic formatting and formulas",
    icon: Plus,
    providerId: "microsoft-excel",
    requiredIntegration: "microsoft-excel",
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
        loadOnMount: true,
        placeholder: "Select a workbook",
        description: "The Excel file containing the table",
        helpText: "Start typing to search through your workbooks"
      },
      {
        name: "tableName",
        label: "Table",
        type: "select",
        dynamic: "microsoft-excel_tables",
        required: true,
        dependsOn: "workbookId",
        placeholder: "Select a table",
        description: "The table to add a row to",
        helpText: "Tables automatically apply formatting and formulas to new rows"
      },
      {
        name: "columnMapping",
        label: "Column Values",
        type: "microsoft_excel_column_mapper",
        required: true,
        dependsOn: "tableName",
        dataSource: "table_columns",
        description: "Map data to table columns",
        helpText: "Select a column from your table, then choose what data should go there"
      }
    ],
    outputSchema: [
      {
        name: "rowIndex",
        label: "Row Index",
        type: "number",
        description: "The index of the new row in the table",
        example: 5
      },
      {
        name: "values",
        label: "Row Values",
        type: "array",
        description: "The data that was added to the row",
        example: [["John Doe", "john@example.com", "Active"]]
      },
      {
        name: "tableName",
        label: "Table Name",
        type: "string",
        description: "The name of the table",
        example: "CustomersTable"
      },
      {
        name: "workbookId",
        label: "Workbook ID",
        type: "string",
        description: "The ID of the workbook",
        example: "01ABC123DEF456789"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the row was added",
        example: "2024-01-15T10:30:00Z"
      }
    ]
  },
  {
    type: "microsoft_excel_action_create_worksheet",
    title: "Create Worksheet",
    description: "Create a new worksheet (tab) in an Excel workbook",
    icon: FilePlus,
    providerId: "microsoft-excel",
    requiredIntegration: "microsoft-excel",
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
        loadOnMount: true,
        placeholder: "Select a workbook",
        description: "The Excel file to add the worksheet to"
      },
      {
        name: "worksheetName",
        label: "Worksheet Name",
        type: "text",
        required: true,
        placeholder: "e.g., Q1 Sales, Project Tasks",
        description: "The name for the new worksheet tab",
        helpText: "Choose a unique name that doesn't already exist in the workbook"
      }
    ],
    outputSchema: [
      {
        name: "worksheetId",
        label: "Worksheet ID",
        type: "string",
        description: "Unique identifier for the created worksheet",
        example: "01AZJL5PN6Y2GOVW7725BZO354PWSELRRZ"
      },
      {
        name: "worksheetName",
        label: "Worksheet Name",
        type: "string",
        description: "Name of the created worksheet",
        example: "Q1 Sales"
      },
      {
        name: "position",
        label: "Position",
        type: "number",
        description: "Position of the worksheet in the workbook (0-indexed)",
        example: 2
      },
      {
        name: "visibility",
        label: "Visibility",
        type: "string",
        description: "Visibility status of the worksheet",
        example: "Visible"
      },
      {
        name: "workbookId",
        label: "Workbook ID",
        type: "string",
        description: "ID of the parent workbook"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the worksheet was created",
        example: "2024-01-15T10:30:00Z"
      }
    ]
  },
  {
    type: "microsoft_excel_action_rename_worksheet",
    title: "Rename Worksheet",
    description: "Rename an existing worksheet (tab) in an Excel workbook",
    icon: Edit,
    providerId: "microsoft-excel",
    requiredIntegration: "microsoft-excel",
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
        loadOnMount: true,
        placeholder: "Select a workbook",
        description: "The Excel file containing the worksheet"
      },
      {
        name: "worksheetName",
        label: "Worksheet to Rename",
        type: "select",
        dynamic: "microsoft-excel_worksheets",
        required: true,
        dependsOn: "workbookId",
        placeholder: "Select worksheet to rename",
        description: "The existing worksheet tab to rename"
      },
      {
        name: "newWorksheetName",
        label: "New Name",
        type: "text",
        required: true,
        dependsOn: "worksheetName",
        placeholder: "e.g., Q2 Sales Data",
        description: "The new name for the worksheet",
        helpText: "Choose a unique name that doesn't already exist in the workbook",
        hasVariablePicker: true
      }
    ],
    outputSchema: [
      {
        name: "worksheetId",
        label: "Worksheet ID",
        type: "string",
        description: "Unique identifier for the worksheet",
        example: "01AZJL5PN6Y2GOVW7725BZO354PWSELRRZ"
      },
      {
        name: "oldName",
        label: "Old Name",
        type: "string",
        description: "Previous name of the worksheet",
        example: "Q1 Sales"
      },
      {
        name: "newName",
        label: "New Name",
        type: "string",
        description: "New name of the worksheet",
        example: "Q2 Sales Data"
      },
      {
        name: "position",
        label: "Position",
        type: "number",
        description: "Position of the worksheet in the workbook (0-indexed)",
        example: 2
      },
      {
        name: "workbookId",
        label: "Workbook ID",
        type: "string",
        description: "ID of the parent workbook"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the worksheet was renamed",
        example: "2024-01-15T10:30:00Z"
      }
    ]
  },
  {
    type: "microsoft_excel_action_delete_worksheet",
    title: "Delete Worksheet",
    description: "Delete a worksheet (tab) from an Excel workbook",
    icon: Trash2,
    providerId: "microsoft-excel",
    requiredIntegration: "microsoft-excel",
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
        loadOnMount: true,
        placeholder: "Select a workbook",
        description: "The Excel file containing the worksheet"
      },
      {
        name: "worksheetName",
        label: "Worksheet to Delete",
        type: "select",
        dynamic: "microsoft-excel_worksheets",
        required: true,
        dependsOn: "workbookId",
        placeholder: "Select worksheet to delete",
        description: "The worksheet tab to remove from the workbook",
        helpText: "Warning: This action cannot be undone. All data in the worksheet will be permanently deleted."
      }
    ],
    outputSchema: [
      {
        name: "deleted",
        label: "Deleted",
        type: "boolean",
        description: "Confirmation that the worksheet was deleted",
        example: true
      },
      {
        name: "worksheetName",
        label: "Worksheet Name",
        type: "string",
        description: "Name of the deleted worksheet",
        example: "Old Data"
      },
      {
        name: "workbookId",
        label: "Workbook ID",
        type: "string",
        description: "ID of the parent workbook"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the worksheet was deleted",
        example: "2024-01-15T10:30:00Z"
      }
    ]
  },
  {
    type: "microsoft_excel_action_add_multiple_rows",
    title: "Add Multiple Rows",
    description: "Add multiple rows to a worksheet in a single batch operation",
    icon: List,
    providerId: "microsoft-excel",
    requiredIntegration: "microsoft-excel",
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
        loadOnMount: true,
        placeholder: "Select a workbook",
        description: "The Excel file to add rows to"
      },
      {
        name: "worksheetName",
        label: "Worksheet",
        type: "select",
        dynamic: "microsoft-excel_worksheets",
        required: true,
        dependsOn: "workbookId",
        placeholder: "Select a worksheet",
        description: "The worksheet to add rows to"
      },
      {
        name: "rows",
        label: "Rows Data",
        type: "array",
        required: true,
        dependsOn: "worksheetName",
        placeholder: "Array of row objects",
        description: "Array of objects, where each object represents a row to add",
        helpText: "Use output from a previous step that returns an array of data objects. Each object should have keys matching the worksheet column headers.",
        hasVariablePicker: true
      },
      {
        name: "columnMapping",
        label: "Column Mapping (Optional)",
        type: "microsoft_excel_column_mapper",
        required: false,
        dependsOn: "worksheetName",
        description: "Optional: Map specific values to columns if not using direct field names",
        helpText: "If your array objects don't match column names exactly, use this to map the data"
      }
    ],
    outputSchema: [
      {
        name: "rowsAdded",
        label: "Rows Added",
        type: "number",
        description: "Number of rows successfully added",
        example: 25
      },
      {
        name: "firstRowNumber",
        label: "First Row Number",
        type: "number",
        description: "Row number of the first added row",
        example: 10
      },
      {
        name: "lastRowNumber",
        label: "Last Row Number",
        type: "number",
        description: "Row number of the last added row",
        example: 34
      },
      {
        name: "worksheetName",
        label: "Worksheet Name",
        type: "string",
        description: "Name of the worksheet"
      },
      {
        name: "workbookId",
        label: "Workbook ID",
        type: "string",
        description: "ID of the workbook"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "When the rows were added",
        example: "2024-01-15T10:30:00Z"
      }
    ]
  }
]