import { FileSpreadsheet, Plus, Edit, List, Search, Trash2, Eraser, Palette } from "lucide-react"
import { NodeComponent } from "../../types"

// Import new action schemas
import { updateCellActionSchema } from "./actions/updateCell.schema"
import { getCellValueActionSchema } from "./actions/getCellValue.schema"
import { appendRowActionSchema } from "./actions/appendRow.schema"
import { clearRangeActionSchema } from "./actions/clearRange.schema"
import { findRowActionSchema } from "./actions/findRow.schema"
import { updateRowActionSchema } from "./actions/updateRow.schema"
import { deleteRowActionSchema } from "./actions/deleteRow.schema"
import { batchUpdateActionSchema } from "./actions/batchUpdate.schema"
import { formatRangeActionSchema } from "./actions/formatRange.schema"

// Apply icons to new action schemas
const updateCell: NodeComponent = {
  ...updateCellActionSchema,
  icon: Edit
}

const getCellValue: NodeComponent = {
  ...getCellValueActionSchema,
  icon: Search
}

const appendRow: NodeComponent = {
  ...appendRowActionSchema,
  icon: Plus
}

const clearRange: NodeComponent = {
  ...clearRangeActionSchema,
  icon: Eraser
}

const findRow: NodeComponent = {
  ...findRowActionSchema,
  icon: Search
}

const updateRow: NodeComponent = {
  ...updateRowActionSchema,
  icon: Edit
}

const deleteRow: NodeComponent = {
  ...deleteRowActionSchema,
  icon: Trash2
}

const batchUpdate: NodeComponent = {
  ...batchUpdateActionSchema,
  icon: Edit
}

const formatRange: NodeComponent = {
  ...formatRangeActionSchema,
  icon: Palette
}

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
        loadingPlaceholder: "Loading spreadsheets...",
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
        loadingPlaceholder: "Loading sheets...",
        description: "The specific sheet (tab) within the spreadsheet"
      },
      {
        name: "skipEmptyRows",
        label: "Skip Empty Rows",
        type: "boolean",
        required: false,
        defaultValue: true,
        dependsOn: "spreadsheetId",
        hidden: {
          $deps: ["spreadsheetId"],
          $condition: { spreadsheetId: { $exists: false } }
        },
        description: "Only trigger when the row has at least one non-empty cell",
        tooltip: "Enable this to ignore completely empty rows"
      },
      {
        name: "requiredColumns",
        label: "Required Columns",
        type: "multi-select",
        dynamic: "google-sheets_columns",
        required: false,
        dependsOn: "sheetName",
        placeholder: "All columns (no filter)",
        loadingPlaceholder: "Loading columns...",
        description: "Only trigger if these columns have values",
        tooltip: "Select which columns must be filled for the workflow to run. Leave empty to trigger on any new row."
      },
    ],
    outputSchema: [
      {
        name: "rowNumber",
        label: "Row Number",
        type: "number",
        description: "The row number where the new data was added"
      },
      {
        name: "values",
        label: "Row Values",
        type: "array",
        description: "Array of cell values from the new row"
      },
      {
        name: "spreadsheetId",
        label: "Spreadsheet ID",
        type: "string",
        description: "The ID of the spreadsheet containing the new row"
      },
      {
        name: "sheetName",
        label: "Sheet Name",
        type: "string",
        description: "Name of the sheet where the row was added"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "ISO timestamp when the row was added"
      }
    ]
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
        description: "Name/title of the newly created worksheet"
      },
      {
        name: "spreadsheetId",
        label: "Spreadsheet ID",
        type: "string",
        description: "The ID of the parent spreadsheet"
      },
      {
        name: "index",
        label: "Sheet Index",
        type: "number",
        description: "Position of the worksheet in the spreadsheet (0-indexed)"
      },
      {
        name: "rowCount",
        label: "Row Count",
        type: "number",
        description: "Number of rows in the new worksheet"
      },
      {
        name: "columnCount",
        label: "Column Count",
        type: "number",
        description: "Number of columns in the new worksheet"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "ISO timestamp when the worksheet was created"
      }
    ]
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
        loadingPlaceholder: "Loading spreadsheets...",
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
        loadingPlaceholder: "Loading sheets...",
        description: "The specific sheet (tab) within the spreadsheet"
      },
      {
        name: "skipEmptyRows",
        label: "Skip Empty Rows",
        type: "boolean",
        required: false,
        defaultValue: true,
        dependsOn: "spreadsheetId",
        hidden: {
          $deps: ["spreadsheetId"],
          $condition: { spreadsheetId: { $exists: false } }
        },
        description: "Only trigger when the updated row has at least one non-empty cell",
        tooltip: "Enable this to ignore updates that result in completely empty rows"
      },
      {
        name: "requiredColumns",
        label: "Required Columns",
        type: "multi-select",
        dynamic: "google-sheets_columns",
        required: false,
        dependsOn: "sheetName",
        placeholder: "All columns (no filter)",
        loadingPlaceholder: "Loading columns...",
        description: "Only trigger if these columns have values after the update",
        tooltip: "Select which columns must be filled for the workflow to run. Leave empty to trigger on any row update."
      },
    ],
    outputSchema: [
      {
        name: "rowNumber",
        label: "Row Number",
        type: "number",
        description: "The row number that was updated"
      },
      {
        name: "values",
        label: "Updated Values",
        type: "array",
        description: "Array of current cell values after the update"
      },
      {
        name: "previousValues",
        label: "Previous Values",
        type: "array",
        description: "Array of cell values before the update"
      },
      {
        name: "changedColumns",
        label: "Changed Columns",
        type: "array",
        description: "Array of column indices that were modified"
      },
      {
        name: "spreadsheetId",
        label: "Spreadsheet ID",
        type: "string",
        description: "The ID of the spreadsheet containing the updated row"
      },
      {
        name: "sheetName",
        label: "Sheet Name",
        type: "string",
        description: "Name of the sheet where the row was updated"
      },
      {
        name: "timestamp",
        label: "Timestamp",
        type: "string",
        description: "ISO timestamp when the row was updated"
      }
    ]
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
  },
  // New schema-based actions
  updateCell,
  getCellValue,
  appendRow,
  clearRange,
  findRow,
  updateRow,
  deleteRow,
  batchUpdate,
  formatRange
]