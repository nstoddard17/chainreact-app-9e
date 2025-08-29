import { FileSpreadsheet } from "lucide-react"
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
      { name: "spreadsheetId", label: "Spreadsheet ID", type: "text", description: "The ID of the Google Sheets spreadsheet" },
      { name: "sheetName", label: "Sheet Name", type: "text", description: "The name of the sheet within the spreadsheet" },
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
      { name: "spreadsheetId", label: "Spreadsheet ID", type: "text", description: "The ID of the Google Sheets spreadsheet" },
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
      { name: "spreadsheetId", label: "Spreadsheet ID", type: "text", description: "The ID of the Google Sheets spreadsheet" },
      { name: "sheetName", label: "Sheet Name", type: "text", description: "The name of the sheet within the spreadsheet" },
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
      // === ACTION SELECTION ===
      {
        name: "action",
        label: "What do you want to do?",
        type: "select",
        required: true,
        options: [
          { value: "add", label: "➕ Add new row" },
          { value: "update", label: "✏️ Update existing row" },
          { value: "delete", label: "🗑️ Delete row" }
        ],
        defaultValue: "add",
        description: "Choose what action to perform on the spreadsheet",
        helpText: "Add: Creates a new row at the bottom of your sheet. Update: Changes data in existing rows. Delete: Removes rows permanently."
      },

      // === SPREADSHEET AND SHEET SELECTION ===
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
        helpText: "Select which sheet tab to add data to"
      },

      // === ADD ROW FIELDS ===
      {
        name: "columnMapping",
        label: "What Data to Add",
        type: "google_sheets_column_mapper",
        required: true,
        showIf: (values: any) => values.action === "add",
        dependsOn: "sheetName",
        description: "Choose which data goes into which columns",
        helpText: "Select a column from your spreadsheet, then choose what data from your workflow should go there. For example, put the 'Email' from your trigger into the 'Email Address' column."
      },

      // === UPDATE ROW FIELDS ===
      {
        name: "findRowBy",
        label: "Find Row By",
        type: "select",
        required: true,
        showIf: (values: any) => values.action === "update",
        options: [
          { value: "row_number", label: "Row number" },
          { value: "column_value", label: "Column value" },
          { value: "conditions", label: "Multiple conditions" }
        ],
        description: "How to identify which row to update",
        helpText: "Row number: Update a specific row (e.g. row 5). Column value: Find row where a column contains a specific value. Multiple conditions: Use complex rules to find the right row."
      },
      {
        name: "updateRowNumber",
        label: "Row Number",
        type: "number",
        required: true,
        showIf: (values: any) => values.action === "update" && values.findRowBy === "row_number",
        placeholder: "Enter row number (e.g. 5)",
        min: 2,
        description: "The row number to update (2 = first data row)",
        helpText: "Row 1 is usually headers, so data starts at row 2"
      },
      {
        name: "updateColumn",
        label: "Column to Check",
        type: "select",
        dynamic: "google-sheets_columns",
        required: true,
        showIf: (values: any) => values.action === "update" && values.findRowBy === "column_value",
        dependsOn: "sheetName",
        placeholder: "Select column",
        description: "Which column contains the value you're looking for",
        helpText: "For example, if you want to update the row where Email is 'john@example.com', select the Email column"
      },
      {
        name: "updateValue",
        label: "Value to Find",
        type: "text",
        required: true,
        showIf: (values: any) => values.action === "update" && values.findRowBy === "column_value",
        placeholder: "Enter value to search for",
        description: "The exact value to find in the selected column",
        helpText: "This will find the first row where the column matches this value exactly"
      },
      {
        name: "conditions",
        label: "Conditions",
        type: "google_sheets_condition_builder",
        required: true,
        showIf: (values: any) => values.action === "update" && values.findRowBy === "conditions",
        dependsOn: "sheetName",
        description: "Set up rules to find the right row",
        helpText: "Create multiple conditions to find rows. For example, 'Status equals Active AND Date is after 2024-01-01'."
      },
      {
        name: "updateMapping",
        label: "What Data to Update",
        type: "google_sheets_column_mapper",
        required: true,
        showIf: (values: any) => values.action === "update",
        dependsOn: "sheetName",
        description: "Choose which columns to update with new data",
        helpText: "Select the columns you want to change and what new data should go in them. Only these columns will be updated - everything else stays the same."
      },

      // === DELETE ROW FIELDS ===
      {
        name: "deleteRowBy",
        label: "Find Row By",
        type: "select",
        required: true,
        showIf: (values: any) => values.action === "delete",
        options: [
          { value: "row_number", label: "Row number" },
          { value: "column_value", label: "Column value" },
          { value: "conditions", label: "Multiple conditions" }
        ],
        description: "How to identify which row to delete",
        helpText: "Row number: Delete a specific row (e.g. row 5). Column value: Find and delete row where a column contains a specific value. Multiple conditions: Use complex rules to find the right row."
      },
      {
        name: "deleteRowNumber",
        label: "Row Number",
        type: "number",
        required: true,
        showIf: (values: any) => values.action === "delete" && values.deleteRowBy === "row_number",
        placeholder: "Enter row number (e.g. 5)",
        min: 2,
        description: "The row number to delete (2 = first data row)",
        helpText: "Row 1 is usually headers, so data starts at row 2"
      },
      {
        name: "deleteColumn",
        label: "Column to Check",
        type: "select",
        dynamic: "google-sheets_columns",
        required: true,
        showIf: (values: any) => values.action === "delete" && values.deleteRowBy === "column_value",
        dependsOn: "sheetName",
        placeholder: "Select column",
        description: "Which column contains the value you're looking for",
        helpText: "For example, if you want to delete the row where Status is 'Inactive', select the Status column"
      },
      {
        name: "deleteValue",
        label: "Value to Find",
        type: "text",
        required: true,
        showIf: (values: any) => values.action === "delete" && values.deleteRowBy === "column_value",
        placeholder: "Enter value to search for",
        description: "The exact value to find in the selected column",
        helpText: "This will delete the first row where the column matches this value exactly. Be careful - this action cannot be undone!"
      },
      {
        name: "deleteConditions",
        label: "Conditions",
        type: "google_sheets_condition_builder",
        required: true,
        showIf: (values: any) => values.action === "delete" && values.deleteRowBy === "conditions",
        dependsOn: "sheetName",
        description: "Set up rules to find the right row",
        helpText: "Create multiple conditions to find rows to delete. For example, 'Status equals Inactive AND Last Login is before 2024-01-01'. Be careful - matching rows will be permanently deleted!"
      },

      // === DATA PREVIEW ===
      {
        name: "dataPreview",
        label: "Sheet Preview",
        type: "google_sheets_data_preview",
        required: false,
        showIf: (values: any) => values.sheetName,
        dependsOn: "sheetName",
        description: "Preview of your spreadsheet data",
        helpText: "This shows you the first few rows of your sheet to help you understand the column structure and data types."
      }
    ],
  },
  {
    type: "google-sheets_action_create_row",
    title: "Create Row",
    description: "Add a new row to a Google Sheets spreadsheet",
    icon: FileSpreadsheet,
    providerId: "google-sheets",
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      { 
        name: "spreadsheetId", 
        label: "Spreadsheet", 
        type: "select", 
        dynamic: "google-sheets_spreadsheets",
        required: true,
        placeholder: "Select a spreadsheet"
      },
      { 
        name: "sheetName", 
        label: "Sheet Name", 
        type: "select", 
        dynamic: "google-sheets_sheets",
        required: true,
        dependsOn: "spreadsheetId",
        placeholder: "Select a sheet"
      },
      { 
        name: "values", 
        label: "Row Data", 
        type: "array", 
        required: true,
        placeholder: "Enter values for each column",
        description: "Values to add as a new row, in column order"
      }
    ]
  },
  {
    type: "google_sheets_action_read_data",
    title: "Read Data from Sheet",
    description: "Reads data from a Google Sheet with filtering and formatting options.",
    icon: FileSpreadsheet,
    isTrigger: false,
    providerId: "google-sheets",
    testable: true,
    requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    category: "Productivity",
    producesOutput: true,
    outputSchema: [
      {
        name: "data",
        label: "Sheet Data",
        type: "array",
        description: "The actual data read from the sheet (format depends on Output Format setting)",
        example: [
          { "Name": "John Doe", "Email": "john@example.com", "Status": "Active" },
          { "Name": "Jane Smith", "Email": "jane@example.com", "Status": "Inactive" }
        ]
      },
      {
        name: "headers",
        label: "Column Headers",
        type: "array",
        description: "The column headers from the sheet (when Include Headers is enabled)",
        example: ["Name", "Email", "Status"]
      },
      {
        name: "rowsRead",
        label: "Rows Read",
        type: "number",
        description: "The number of data rows successfully read",
        example: 25
      },
      {
        name: "totalRows",
        label: "Total Rows",
        type: "number",
        description: "The total number of rows in the sheet",
        example: 100
      },
      {
        name: "columnCount",
        label: "Column Count",
        type: "number",
        description: "The number of columns in the sheet",
        example: 5
      },
      {
        name: "range",
        label: "Range Read",
        type: "string",
        description: "The exact range that was read in A1 notation",
        example: "Sheet1!A1:E26"
      },
      {
        name: "spreadsheetTitle",
        label: "Spreadsheet Title",
        type: "string",
        description: "The name of the spreadsheet",
        example: "Sales Report 2024"
      },
      {
        name: "sheetTitle",
        label: "Sheet Title",
        type: "string",
        description: "The name of the sheet that was read",
        example: "January"
      }
    ],
    configSchema: [
      {
        name: "spreadsheetId",
        label: "Spreadsheet",
        type: "select",
        dynamic: "google-sheets_spreadsheets",
        required: true,
        placeholder: "Select a spreadsheet",
        description: "The Google Sheets file to read from"
      },
      {
        name: "sheetName",
        label: "Sheet",
        type: "select",
        dynamic: "google-sheets_sheets",
        required: true,
        dependsOn: "spreadsheetId",
        placeholder: "Select a sheet",
        description: "The specific sheet (tab) to read"
      },
      {
        name: "range",
        label: "Range (Optional)",
        type: "text",
        required: false,
        placeholder: "e.g., A1:E10, A:A, 2:5",
        description: "Specific range to read. Leave empty to read all data.",
        helpText: "Use A1 notation like 'A1:C10' for a rectangle, 'A:C' for columns, or '2:5' for rows"
      },
      {
        name: "includeHeaders",
        label: "Include Headers",
        type: "boolean",
        required: false,
        defaultValue: true,
        description: "Include the first row as column headers"
      },
      {
        name: "outputFormat",
        label: "Output Format",
        type: "select",
        required: false,
        defaultValue: "objects",
        options: [
          { value: "objects", label: "Objects (Key-Value pairs)" },
          { value: "arrays", label: "Arrays (Raw values)" },
          { value: "csv", label: "CSV String" }
        ],
        description: "How to format the output data",
        helpText: "Objects: Each row as {column: value}. Arrays: Each row as [value1, value2]. CSV: Comma-separated text."
      },
      {
        name: "maxRows",
        label: "Max Rows",
        type: "number",
        required: false,
        placeholder: "Leave empty for all rows",
        min: 1,
        max: 10000,
        description: "Maximum number of rows to read",
        helpText: "Useful for limiting data when processing large sheets"
      },
      {
        name: "skipEmptyRows",
        label: "Skip Empty Rows",
        type: "boolean",
        required: false,
        defaultValue: true,
        description: "Skip rows that are completely empty"
      },
      {
        name: "filterColumn",
        label: "Filter by Column (Optional)",
        type: "select",
        dynamic: "google-sheets_columns",
        required: false,
        dependsOn: "sheetName",
        placeholder: "Select column to filter",
        description: "Only return rows where this column matches a condition"
      },
      {
        name: "filterOperator",
        label: "Filter Operator",
        type: "select",
        required: false,
        showIf: (values: any) => values.filterColumn,
        options: [
          { value: "equals", label: "Equals" },
          { value: "not_equals", label: "Not Equals" },
          { value: "contains", label: "Contains" },
          { value: "not_contains", label: "Does Not Contain" },
          { value: "starts_with", label: "Starts With" },
          { value: "ends_with", label: "Ends With" },
          { value: "greater_than", label: "Greater Than" },
          { value: "less_than", label: "Less Than" },
          { value: "is_empty", label: "Is Empty" },
          { value: "is_not_empty", label: "Is Not Empty" }
        ],
        defaultValue: "equals",
        description: "How to compare the filter value"
      },
      {
        name: "filterValue",
        label: "Filter Value",
        type: "text",
        required: false,
        showIf: (values: any) => values.filterColumn && values.filterOperator && !["is_empty", "is_not_empty"].includes(values.filterOperator),
        placeholder: "Enter value to filter by",
        description: "The value to compare against"
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
        label: "Initial Data",
        type: "textarea",
        required: false,
        placeholder: "Paste CSV data or leave empty",
        description: "Optional data to populate the first sheet (CSV format)"
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