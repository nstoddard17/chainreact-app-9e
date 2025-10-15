import { Database, Plus, Edit, List } from "lucide-react"
import { NodeComponent } from "../../types"

// Import Airtable action metadata if it exists
const AIRTABLE_CREATE_RECORD_METADATA = { key: "airtable_action_create_record", name: "Create Record", description: "Create a new record in a table" }

export const airtableNodes: NodeComponent[] = [
  {
    type: "airtable_trigger_new_record",
    title: "New Record",
    description: "Triggers when a new record is created in a table",
    icon: Database,
    providerId: "airtable",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    requiresConnection: true,
    configSchema: [
      {
        name: "baseId",
        label: "Base",
        type: "select",
        dynamic: "airtable_bases",
        required: true,
        loadOnMount: true,
        description: "Select the Airtable base to monitor"
      },
      {
        name: "tableName",
        label: "Table (Optional)",
        type: "select",
        dynamic: "airtable_tables",
        required: false,
        dependsOn: "baseId",
        description: "Leave empty to monitor all tables in the base"
      },
      {
        name: "changeGrouping",
        label: "Linked record handling",
        type: "select",
        required: false,
        defaultValue: "per_record",
        options: [
          { value: "per_record", label: "Run once per record change" },
          { value: "combine_linked", label: "Combine linked updates into one run" }
        ],
        description: "Control how linked-record updates are delivered to this workflow.",
        tooltip: "Airtable may emit multiple record events when linked fields change. Choose whether to run this workflow for each record individually or combine related updates into a single run (available when verification delay is 0)."
      },
      {
        name: "watchedFieldIds",
        label: "Fields to watch (optional)",
        type: "multiselect",
        required: false,
        dynamic: "airtable_fields",
        dependsOn: "tableName",
        description: "Only trigger when these fields change. Leave empty to trigger on any field change.",
        advanced: true
      },
      {
        name: "verificationDelay",
        label: "Verification Delay",
        type: "number",
        required: false,
        defaultValue: 30,
        min: 0,
        max: 120,
        step: 5,
        unit: "seconds",
        description: "Wait time before processing new records to ensure they're complete",
        advanced: true,
        helpText: "Recommended: 30-60 seconds. Prevents triggering on incomplete records or accidental creates."
      }
    ],
    outputSchema: [
      { name: "baseId", label: "Base ID", type: "string", description: "The unique ID of the base" },
      { name: "tableId", label: "Table ID", type: "string", description: "The unique ID of the table" },
      { name: "tableName", label: "Table Name", type: "string", description: "The name of the table" },
      { name: "recordId", label: "Record ID", type: "string", description: "The unique ID of the record" },
      { name: "fields", label: "Fields", type: "object", description: "All field values of the new record" },
      { name: "createdAt", label: "Created At", type: "string", description: "When the record was created" },
      { name: "recordBatch", label: "Record Batch", type: "array", description: "All records included when linked updates are combined" }
    ]
  },
  {
    type: "airtable_trigger_record_updated",
    title: "Record Updated",
    description: "Triggers when a record is modified or deleted in a table",
    icon: Edit,
    providerId: "airtable",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    requiresConnection: true,
    configSchema: [
      {
        name: "baseId",
        label: "Base",
        type: "select",
        dynamic: "airtable_bases",
        required: true,
        loadOnMount: true,
        description: "Select the Airtable base to monitor"
      },
      {
        name: "tableName",
        label: "Table (Optional)",
        type: "select",
        dynamic: "airtable_tables",
        required: false,
        dependsOn: "baseId",
        description: "Leave empty to monitor all tables in the base"
      },
      {
        name: "changeGrouping",
        label: "Linked record handling",
        type: "select",
        required: false,
        defaultValue: "per_record",
        options: [
          { value: "per_record", label: "Run once per record change" },
          { value: "combine_linked", label: "Combine linked updates into one run" }
        ],
        description: "Control how linked-record updates are delivered to this workflow.",
        tooltip: "Airtable may emit multiple record events when linked fields change. Choose whether to run this workflow for each record individually or combine related updates into a single run (available when verification delay is 0)."
      },
      {
        name: "watchedFieldIds",
        label: "Fields to watch (optional)",
        type: "multiselect",
        required: false,
        dynamic: "airtable_fields",
        dependsOn: "tableName",
        description: "Only trigger when these fields change. Leave empty to trigger on any field change.",
        advanced: true
      },
      {
        name: "verificationDelay",
        label: "Verification Delay",
        type: "number",
        required: false,
        defaultValue: 0,
        min: 0,
        max: 120,
        step: 5,
        unit: "seconds",
        description: "Wait time before processing updated records",
        advanced: true,
        helpText: "Usually not needed for updates. Set to 0 for immediate processing."
      }
    ],
    outputSchema: [
      { name: "baseId", label: "Base ID", type: "string", description: "The unique ID of the base" },
      { name: "tableId", label: "Table ID", type: "string", description: "The unique ID of the table" },
      { name: "tableName", label: "Table Name", type: "string", description: "The name of the table" },
      { name: "recordId", label: "Record ID", type: "string", description: "The unique ID of the record" },
      { name: "changedFields", label: "Current Values", type: "object", description: "The current values of all fields" },
      { name: "previousValues", label: "Previous Values", type: "object", description: "The previous values before the update" },
      { name: "updatedAt", label: "Updated At", type: "string", description: "When the record was updated" },
      { name: "recordBatch", label: "Record Batch", type: "array", description: "All records included when linked updates are combined" }
    ]
  },
  {
    type: "airtable_trigger_table_deleted",
    title: "Table Deleted",
    description: "Triggers when an entire table is deleted from a base",
    icon: Database,
    providerId: "airtable",
    category: "Productivity",
    isTrigger: true,
    producesOutput: true,
    requiresConnection: true,
    configSchema: [
      {
        name: "baseId",
        label: "Base",
        type: "select",
        dynamic: "airtable_bases",
        required: true,
        loadOnMount: true,
        description: "Select the Airtable base to monitor for table deletions"
      }
    ],
    outputSchema: [
      { name: "baseId", label: "Base ID", type: "string", description: "The unique ID of the base" },
      { name: "tableId", label: "Table ID", type: "string", description: "The unique ID of the deleted table" },
      { name: "deletedAt", label: "Deleted At", type: "string", description: "When the table was deleted" }
    ],
    note: "Note: Airtable webhooks only detect when entire tables are deleted, not individual records"
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
        loadOnMount: true,
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
        loadOnMount: true,
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
        loadOnMount: true,
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
        visibilityCondition: { field: "baseId", operator: "equals", value: "!empty" }
      },
      {
        name: "keywordSearch",
        label: "Keyword Search",
        type: "text",
        required: false,
        placeholder: "Search across all text fields...",
        description: "Search for keywords across all text fields in the table",
        hidden: true,
        visibilityCondition: { field: "tableName", operator: "equals", value: "!empty" }
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
        visibilityCondition: { field: "tableName", operator: "equals", value: "!empty" }
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
        visibilityCondition: { field: "filterField", operator: "equals", value: "!empty" }
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
        visibilityCondition: { field: "tableName", operator: "equals", value: "!empty" }
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
        visibilityCondition: { field: "tableName", operator: "equals", value: "!empty" }
      },
      {
        name: "customDateRange",
        label: "Custom Date Range",
        type: "daterange",
        required: false,
        placeholder: "Select date range...",
        description: "Choose a custom date range to filter records",
        dependsOn: "dateFilter",
        visibilityCondition: { field: "dateFilter", operator: "equals", value: "custom_date_range" }
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
        visibilityCondition: { field: "tableName", operator: "equals", value: "!empty" }
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
        visibilityCondition: { field: "recordLimit", operator: "equals", value: "custom" }
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
