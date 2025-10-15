import { FileSpreadsheet, Plus, Edit, List, Search, Trash2 } from "lucide-react"
import { NodeComponent } from "../../types"

export const googleSheetsNodes: NodeComponent[] = [
  {
    type: "google_sheets_trigger_new_row",
    title: "New Row",
    description: "Triggers when a new row is added to a sheet",
    icon: FileSpreadsheet,
    providerId: "google-sheets",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "spreadsheetId",
        label: "Spreadsheet",
        type: "select",
        dynamic: "google-sheets_spreadsheets",
        required: true,
        loadOnMount: true,
        placeholder: "Select a spreadsheet",
        description: "Choose a spreadsheet from your Google Sheets account"
      },
      {
        name: "sheetName",
        label: "Sheet Name",
        type: "select",
        dynamic: "google-sheets_sheets",
        required: true,
        dependsOn: "spreadsheetId",
        placeholder: "Select a sheet",
        description: "The specific sheet (tab) within the spreadsheet"
      },
    ],
  },
  {
    type: "google_sheets_trigger_new_worksheet",
    title: "New Worksheet",
    description: "Triggers when a new worksheet is created in a spreadsheet",
    icon: FileSpreadsheet,
    providerId: "google-sheets",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      {
        name: "spreadsheetId",
        label: "Spreadsheet",
        type: "select",
        dynamic: "google-sheets_spreadsheets",
        required: true,
        loadOnMount: true,
        placeholder: "Select a spreadsheet",
        description: "Choose a spreadsheet from your Google Sheets account"
      },
    ],
  },
  {
    type: "google_sheets_trigger_updated_row",
    title: "Updated Row in Sheet",
    description: "Triggers when a row is updated in a Google Sheet.",
    icon: FileSpreadsheet,
    isTrigger: true,
    providerId: "google-sheets",
    category: "Productivity",
    producesOutput: true,
    configSchema: [
      {
        name: "spreadsheetId",
        label: "Spreadsheet",
        type: "select",
        dynamic: "google-sheets_spreadsheets",
        required: true,
        loadOnMount: true,
        placeholder: "Select a spreadsheet",
        description: "Choose a spreadsheet from your Google Sheets account"
      },
      {
        name: "sheetName",
        label: "Sheet Name",
        type: "select",
        dynamic: "google-sheets_sheets",
        required: true,
        dependsOn: "spreadsheetId",
        placeholder: "Select a sheet",
        description: "The specific sheet (tab) within the spreadsheet"
      },
    ],
  },
  {
    type: "google_sheets_unified_action",
    title: "Manage Sheet Data",
    description: "Add, update, or remove data in Google Sheets with visual column mapping.",
    icon: FileSpreadsheet,
    isTrigger: false,
    providerId: "google-sheets",
    testable: true,
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
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
        name: "spreadsheetId",
        label: "Spreadsheet ID",
        type: "string",
        description: "The ID of the spreadsheet that was modified",
        example: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
      },
      {
        name: "sheetName",
        label: "Sheet Name",
        type: "string",
        description: "The name of the sheet that was modified",
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
      // === SPREADSHEET AND SHEET SELECTION (ALWAYS VISIBLE) ===
      {
        name: "spreadsheetId",
        label: "Spreadsheet",
        type: "select",
        dynamic: "google-sheets_spreadsheets",
        required: true,
        placeholder: "Select a spreadsheet",
        description: "The Google Sheets file you want to work with",
        helpText: "Start typing to search through your spreadsheets"
      },
      {
        name: "sheetName",
        label: "Sheet",
        type: "select",
        dynamic: "google-sheets_sheets",
        required: true,
        dependsOn: "spreadsheetId",
        placeholder: "Select a sheet",
        description: "The specific sheet (tab) within the spreadsheet",
        helpText: "Select which sheet tab to work with"
      },

      // === ACTION SELECTION (VISIBLE AFTER SHEET SELECTION) ===
      {
        name: "action",
        label: "What do you want to do?",
        type: "select",
        required: true,
        hidden: true,
        showIf: (values: any) => values.sheetName,
        placeholder: "Select an action...",
        options: [
          { value: "add", label: "➕ Add new row" },
          { value: "update", label: "✏️ Update existing row" },
          { value: "delete", label: "🗑️ Delete row" }
        ],
        description: "Choose what action to perform on the spreadsheet",
        helpText: "Add: Creates a new row in your sheet. Update: Changes data in existing rows. Delete: Removes rows permanently."
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
        helpText: "Choose where in the sheet to add the new row"
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
        type: "google_sheets_column_mapper",
        required: true,
        hidden: true,
        showIf: (values: any) => values.action === "add",
        dependsOn: "sheetName",
        description: "Choose which data goes into which columns",
        helpText: "Select a column from your spreadsheet, then choose what data from your workflow should go there. For example, put the 'Email' from your trigger into the 'Email Address' column."
      },

      // === UPDATE ROW FIELDS ===
      // Removed findRowBy field - users now select rows directly from the preview table
      {
        name: "updateRowNumber",
        label: "Selected Row Number",
        type: "number",
        required: false,
        hidden: true, // Hidden field, populated when user selects a row from preview
        showIf: (values: any) => false, // Never show to user
        description: "The row number selected from the preview table"
      },
      // Removed updateColumn, updateValue, and conditions fields - users now select rows directly from preview
      // Column selection and value fields are now handled in the UI after row selection

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
        label: "Sheet Preview",
        type: "google_sheets_data_preview",
        required: false,
        hidden: true,
        showIf: (values: any) => values.sheetName && (values.action === "update" || (values.action === "delete" && values.deleteRowBy === "column_value")),
        dependsOn: "sheetName",
        description: "Preview of your spreadsheet data",
        helpText: "This shows you the first few rows of your sheet to help you understand the column structure and data types."
      },
      
      // Column selection for delete is handled in the GoogleSheetsDeleteConfirmation component
      
      // Delete fields (deleteSearchColumn, deleteSearchValue, deleteAll) are handled in GoogleSheetsDeleteConfirmation component
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
    type: "google-sheets_action_export_sheet",
    title: "Export Sheet",
    description: "Export and filter data from a Google Sheets spreadsheet",
    icon: Search,
    providerId: "google-sheets",
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    category: "Productivity",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "spreadsheetId",
        label: "Spreadsheet",
        type: "select",
        dynamic: "google-sheets_spreadsheets",
        required: true,
        placeholder: "Select a spreadsheet",
        description: "The Google Sheets file to export from"
      },
      {
        name: "sheetName",
        label: "Sheet",
        type: "select",
        dynamic: "google-sheets_sheets",
        required: true,
        dependsOn: "spreadsheetId",
        placeholder: "Select a sheet",
        description: "The specific sheet (tab) to export"
      },
      {
        name: "keywordSearch",
        label: "Keyword Search",
        type: "text",
        required: false,
        placeholder: "Search across all columns...",
        description: "Search for keywords across all text columns in the sheet"
      },
      {
        name: "filterColumn",
        label: "Filter by Column",
        type: "select",
        dynamic: "google-sheets_columns",
        required: false,
        placeholder: "Select column to filter by...",
        description: "Choose a column to filter rows by",
        dependsOn: "sheetName"
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
        visibilityCondition: { field: "filterColumn", operator: "equals", value: "!empty" }
      },
      {
        name: "filterValue",
        label: "Filter Value",
        type: "select",
        dynamic: "google-sheets_column_values",
        required: false,
        placeholder: "Select or enter value...",
        description: "Choose the value to filter by",
        dependsOn: "filterColumn",
        visibilityCondition: {
          and: [
            { field: "filterColumn", operator: "isNotEmpty" },
            { field: "filterOperator", operator: "in", value: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "greater_than", "less_than", "greater_equal", "less_equal"] }
          ]
        }
      },
      {
        name: "additionalFilters",
        label: "Additional Filters",
        type: "custom",
        required: false,
        description: "Add more filter conditions (AND logic)",
        dependsOn: "sheetName",
        hidden: true
      },
      {
        name: "sortColumn",
        label: "Sort by Column",
        type: "select",
        dynamic: "google-sheets_columns",
        required: false,
        placeholder: "Select column to sort by...",
        description: "Choose a column to sort results by",
        dependsOn: "sheetName"
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
        name: "dateFilter",
        label: "Date Filter",
        type: "select",
        required: false,
        options: [
          { value: "", label: "No date filter" },
          { value: "today", label: "Today" },
          { value: "yesterday", label: "Yesterday" },
          { value: "this_week", label: "This Week" },
          { value: "last_week", label: "Last Week" },
          { value: "this_month", label: "This Month" },
          { value: "last_month", label: "Last Month" },
          { value: "last_7_days", label: "Last 7 Days" },
          { value: "last_30_days", label: "Last 30 Days" },
          { value: "last_90_days", label: "Last 90 Days" },
          { value: "this_year", label: "This Year" },
          { value: "custom_range", label: "Custom Date Range" }
        ],
        placeholder: "Select date filter...",
        description: "Filter rows by date (requires a date column)"
      },
      {
        name: "dateColumn",
        label: "Date Column",
        type: "select",
        dynamic: "google-sheets_columns",
        required: false,
        placeholder: "Select date column...",
        description: "Column containing dates to filter by",
        dependsOn: "sheetName",
        visibilityCondition: { field: "dateFilter", operator: "in", value: ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "last_7_days", "last_30_days", "last_90_days", "this_year", "custom_range"] }
      },
      {
        name: "customDateRange",
        label: "Custom Date Range",
        type: "daterange",
        required: false,
        placeholder: "Select date range...",
        description: "Choose a custom date range to filter rows",
        dependsOn: "dateFilter",
        visibilityCondition: { field: "dateFilter", operator: "equals", value: "custom_range" }
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
        visibilityCondition: { field: "recordLimit", operator: "equals", value: "custom" },
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
      },
      {
        name: "formula",
        label: "Google Sheets Formula (Advanced)",
        type: "textarea",
        required: false,
        placeholder: "e.g., =FILTER(A:E, C:C='Active')",
        description: "Advanced filtering using Google Sheets formulas",
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
        description: "Total number of rows in the sheet"
      },
      {
        name: "headers",
        label: "Headers",
        type: "array",
        description: "Column headers from the sheet"
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
    type: "google_sheets_action_create_spreadsheet",
    title: "Create New Spreadsheet",
    description: "Creates a new Google Sheets spreadsheet with customizable properties.",
    icon: FileSpreadsheet,
    isTrigger: false,
    providerId: "google-sheets",
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    category: "Productivity",
    configSchema: [
      {
        name: "title",
        label: "Spreadsheet Title",
        type: "text",
        required: true,
        placeholder: "e.g., Sales Report 2024, Project Tracker",
        description: "The name of the new spreadsheet"
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        required: false,
        placeholder: "Optional description of the spreadsheet",
        description: "A brief description of what this spreadsheet is for"
      },
      {
        name: "sheets",
        label: "Sheets",
        type: "custom",
        required: false,
        description: "Configure multiple sheets for your spreadsheet"
      },
      {
        name: "template",
        label: "Template",
        type: "select",
        required: false,
        options: [
          { value: "blank", label: "Blank Spreadsheet" },
          { value: "budget", label: "Budget Tracker" },
          { value: "project", label: "Project Management" },
          { value: "crm", label: "Customer Database" },
          { value: "inventory", label: "Inventory Management" },
          { value: "calendar", label: "Content Calendar" }
        ],
        defaultValue: "blank",
        description: "Start with a pre-built template or blank sheet"
      },
      {
        name: "initialData",
        label: "Pre-fill Sheet1 with Data (Optional)",
        type: "textarea",
        required: false,
        placeholder: "Example:\nName,Age,City\nJohn,30,NYC\nJane,25,LA",
        description: "Add starting data to the first sheet. Paste data in CSV format (values separated by commas, rows separated by line breaks)",
        helpText: "Format: Use commas to separate columns and new lines to separate rows. First row can be headers."
      }
    ],
    outputSchema: [
      {
        name: "spreadsheetId",
        label: "Spreadsheet ID",
        type: "string",
        description: "The unique ID of the created spreadsheet"
      },
      {
        name: "spreadsheetUrl",
        label: "Spreadsheet URL",
        type: "string",
        description: "Direct link to open the spreadsheet"
      },
      {
        name: "title",
        label: "Title",
        type: "string",
        description: "The title of the created spreadsheet"
      },
      {
        name: "sheetsCreated",
        label: "Sheets Created",
        type: "number",
        description: "Number of sheets created in the spreadsheet"
      }
    ]
  }
]