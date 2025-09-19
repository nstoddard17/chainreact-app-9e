import { Database, Plus, Edit, List } from "lucide-react"
import { NodeComponent } from "../../types"

// Import Airtable action metadata if it exists
const AIRTABLE_CREATE_RECORD_METADATA = { key: "airtable_action_create_record", name: "Create Record", description: "Create a new record in a table" }

export const airtableNodes: NodeComponent[] = [
  {
    type: "airtable_trigger_new_record",
    title: "New Record",
    description: "Triggers when a new record is created in a base",
    icon: Database,
    providerId: "airtable",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "baseId", label: "Base", type: "select", dynamic: "airtable_bases", required: true },
      { name: "tableName", label: "Table", type: "select", dynamic: "airtable_tables", required: true, dependsOn: "baseId" }
    ],
    outputSchema: [
      { name: "baseId", label: "Base ID", type: "string", description: "The unique ID of the base" },
      { name: "tableId", label: "Table ID", type: "string", description: "The unique ID of the table" },
      { name: "tableName", label: "Table Name", type: "string", description: "The name of the table" },
      { name: "recordId", label: "Record ID", type: "string", description: "The unique ID of the record" },
      { name: "fields", label: "Fields", type: "object", description: "The fields and values of the record" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the record was created" }
    ]
  },
  {
    type: "airtable_trigger_record_updated",
    title: "Record Updated",
    description: "Triggers when an existing record is updated",
    icon: Database,
    providerId: "airtable",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "baseId", label: "Base", type: "select", dynamic: "airtable_bases", required: true },
      { name: "tableName", label: "Table", type: "select", dynamic: "airtable_tables", required: true, dependsOn: "baseId" }
    ],
    outputSchema: [
      { name: "baseId", label: "Base ID", type: "string", description: "The unique ID of the base" },
      { name: "tableId", label: "Table ID", type: "string", description: "The unique ID of the table" },
      { name: "tableName", label: "Table Name", type: "string", description: "The name of the table" },
      { name: "recordId", label: "Record ID", type: "string", description: "The unique ID of the record" },
      { name: "changedFields", label: "Changed Fields", type: "object", description: "The fields that were changed" },
      { name: "previousValues", label: "Previous Values", type: "object", description: "The previous values of changed fields" },
      { name: "updatedAt", label: "Updated At", type: "string", description: "When the record was updated" }
    ]
  },
  {
    type: "airtable_trigger_record_deleted",
    title: "Record Deleted",
    description: "Triggers when a record is deleted",
    icon: Database,
    providerId: "airtable",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    configSchema: [
      { name: "baseId", label: "Base", type: "select", dynamic: "airtable_bases", required: true },
      { name: "tableName", label: "Table", type: "select", dynamic: "airtable_tables", required: true, dependsOn: "baseId" }
    ],
    outputSchema: [
      { name: "baseId", label: "Base ID", type: "string", description: "The unique ID of the base" },
      { name: "tableId", label: "Table ID", type: "string", description: "The unique ID of the table" },
      { name: "tableName", label: "Table Name", type: "string", description: "The name of the table" },
      { name: "recordId", label: "Record ID", type: "string", description: "The unique ID of the deleted record" },
      { name: "deletedAt", label: "Deleted At", type: "string", description: "When the record was deleted" }
    ]
  },
  {
    type: "airtable_action_create_record",
    title: "Create Record",
    description: "Create a new record in a table",
    icon: Plus,
    providerId: "airtable",
    requiredScopes: ["data.records:write"],
    category: "Productivity",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "baseId",
        label: "Base",
        type: "select",
        dynamic: "airtable_bases",
        required: true,
        placeholder: "Select a base"
      },
      {
        name: "tableName",
        label: "Table",
        type: "select",
        dynamic: "airtable_tables",
        required: true,
        placeholder: "Select a table",
        description: "Choose the table to create records in",
        dependsOn: "baseId"
      }
    ],
    outputSchema: [
      {
        name: "recordId",
        label: "Record ID",
        type: "string",
        description: "The unique ID of the created record"
      },
      {
        name: "createdTime",
        label: "Created Time",
        type: "string",
        description: "When the record was created"
      },
      {
        name: "fields",
        label: "Record Fields",
        type: "object",
        description: "The fields and values of the created record"
      }
    ]
  },
  {
    type: "airtable_action_update_record",
    title: "Update Record",
    description: "Update an existing record in Airtable",
    icon: Edit,
    providerId: "airtable",
    requiredScopes: ["data.records:write"],
    category: "Productivity",
    isTrigger: false,
    configSchema: [
      {
        name: "baseId",
        label: "Base",
        type: "select",
        dynamic: "airtable_bases",
        required: true,
        placeholder: "Select a base"
      },
      {
        name: "tableName",
        label: "Table",
        type: "select",
        dynamic: "airtable_tables",
        required: true,
        placeholder: "Select a table",
        description: "Choose the table to update records in",
        dependsOn: "baseId"
      },
      {
        name: "recordId",
        label: "Record ID",
        type: "text",
        required: true,
        placeholder: "Select a record from the table below",
        description: "The ID of the record to update",
        readonly: true,
        hidden: true
      },
      {
        name: "fields",
        label: "Record Fields",
        type: "custom",
        required: true,
        description: "Configure the fields and values for the updated record",
        dependsOn: "tableName",
        hidden: true
      }
    ]
  },
  {
    type: "airtable_action_list_records",
    title: "Get Records",
    description: "Get records from an Airtable table",
    icon: List,
    providerId: "airtable",
    requiredScopes: ["data.records:read"],
    category: "Productivity",
    isTrigger: false,
    producesOutput: true,
    configSchema: [
      {
        name: "baseId",
        label: "Base",
        type: "select",
        dynamic: "airtable_bases",
        required: true,
        placeholder: "Select a base"
      },
      {
        name: "tableName",
        label: "Table",
        type: "select",
        dynamic: "airtable_tables",
        required: true,
        placeholder: "Select a table",
        description: "Choose the table to get records from",
        dependsOn: "baseId",
        hidden: true,
        showWhen: { baseId: "!empty" }
      },
      {
        name: "keywordSearch",
        label: "Keyword Search",
        type: "text",
        required: false,
        placeholder: "Search across all text fields...",
        description: "Search for keywords across all text fields in the table",
        hidden: true,
        showWhen: { tableName: "!empty" }
      },
      {
        name: "filterField",
        label: "Filter by Field",
        type: "select",
        dynamic: "airtable_fields",
        required: false,
        placeholder: "Select field to filter by...",
        description: "Choose a field to filter records by",
        dependsOn: "tableName",
        hidden: true,
        showWhen: { tableName: "!empty" }
      },
      {
        name: "filterValue",
        label: "Filter Value",
        type: "select",
        dynamic: "airtable_field_values",
        required: false,
        placeholder: "Select value...",
        description: "Choose the value to filter by",
        dependsOn: "filterField",
        showWhen: { filterField: "!empty" }
      },
      {
        name: "sortOrder",
        label: "Sort Order",
        type: "select",
        required: false,
        options: [
          { value: "newest", label: "Newest First (by Created Time)" },
          { value: "oldest", label: "Oldest First (by Created Time)" },
          { value: "recently_modified", label: "Recently Modified First" },
          { value: "least_recently_modified", label: "Least Recently Modified First" }
        ],
        defaultValue: "newest",
        placeholder: "Select sort order...",
        description: "How to sort the returned records",
        hidden: true,
        showWhen: { tableName: "!empty" }
      },
      {
        name: "dateFilter",
        label: "Date Filter",
        type: "select",
        required: false,
        options: [
          { value: "", label: "No date filter" },
          { value: "today", label: "Created Today" },
          { value: "yesterday", label: "Created Yesterday" },
          { value: "last_7_days", label: "Created in Last 7 Days" },
          { value: "last_30_days", label: "Created in Last 30 Days" },
          { value: "this_month", label: "Created This Month" },
          { value: "last_month", label: "Created Last Month" },
          { value: "custom_date_range", label: "Custom Date Range" }
        ],
        placeholder: "Select date filter...",
        description: "Filter records by creation date",
        hidden: true,
        showWhen: { tableName: "!empty" }
      },
      {
        name: "customDateRange",
        label: "Custom Date Range",
        type: "daterange",
        required: false,
        placeholder: "Select date range...",
        description: "Choose a custom date range to filter records",
        dependsOn: "dateFilter",
        showWhen: { dateFilter: "custom_date_range" }
      },
      {
        name: "recordLimit",
        label: "Record Limit",
        type: "select",
        required: false,
        options: [
          { value: "", label: "Use Max Records setting" },
          { value: "last_10", label: "Last 10 Records" },
          { value: "last_20", label: "Last 20 Records" },
          { value: "last_50", label: "Last 50 Records" },
          { value: "last_100", label: "Last 100 Records" },
          { value: "custom", label: "Custom Amount" }
        ],
        placeholder: "Select record limit...",
        description: "Quick limit for most recent records",
        hidden: true,
        showWhen: { tableName: "!empty" }
      },
      {
        name: "maxRecords",
        label: "Max Records",
        type: "number",
        required: false,
        defaultValue: 100,
        placeholder: "100",
        description: "Maximum number of records to return",
        dependsOn: "recordLimit",
        showWhen: { recordLimit: "custom" }
      },
      {
        name: "filterByFormula",
        label: "Advanced Filter Formula",
        type: "textarea",
        required: false,
        placeholder: "{Status} = 'Active'",
        description: "Advanced Airtable filter formula (will be combined with other filters using AND logic)",
        advanced: true
      }
    ]
  },
]