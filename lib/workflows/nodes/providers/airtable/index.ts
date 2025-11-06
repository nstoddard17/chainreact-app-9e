import { Database, Plus, Edit, List, Search, FileText, Trash2, Paperclip, Copy } from "lucide-react"
import { NodeComponent } from "../../types"

// Import new action schemas
import { updateMultipleRecordsActionSchema } from "./actions/updateMultipleRecords.schema"
import { findRecordActionSchema } from "./actions/findRecord.schema"
import { getRecordActionSchema } from "./actions/getRecord.schema"
import { deleteRecordActionSchema } from "./actions/deleteRecord.schema"
import { addAttachmentActionSchema } from "./actions/addAttachment.schema"
import { duplicateRecordActionSchema } from "./actions/duplicateRecord.schema"
import { getTableSchemaActionSchema } from "./actions/getTableSchema.schema"
import { createMultipleRecordsActionSchema } from "./actions/createMultipleRecords.schema"

// Import Airtable action metadata if it exists
const AIRTABLE_CREATE_RECORD_METADATA = { key: "airtable_action_create_record", name: "Create Record", description: "Create a new record in a table" }

// Apply icons to new action schemas
const updateMultipleRecords: NodeComponent = {
  ...updateMultipleRecordsActionSchema,
  icon: Edit
}

const findRecord: NodeComponent = {
  ...findRecordActionSchema,
  icon: Search
}

const getRecord: NodeComponent = {
  ...getRecordActionSchema,
  icon: FileText
}

const deleteRecord: NodeComponent = {
  ...deleteRecordActionSchema,
  icon: Trash2
}

const addAttachment: NodeComponent = {
  ...addAttachmentActionSchema,
  icon: Paperclip
}

const duplicateRecord: NodeComponent = {
  ...duplicateRecordActionSchema,
  icon: Copy
}

const getTableSchema: NodeComponent = {
  ...getTableSchemaActionSchema,
  icon: Database
}

const createMultipleRecords: NodeComponent = {
  ...createMultipleRecordsActionSchema,
  icon: Plus
}

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
      },
      {
        name: "watchedTables",
        label: "Watch Specific Tables (Optional)",
        type: "multiselect",
        dynamic: "airtable_tables",
        required: false,
        dependsOn: "baseId",
        description: "Only trigger when these specific tables are deleted. Leave empty to monitor all tables in the base.",
        placeholder: "Monitor all tables",
        advanced: false
      }
    ],
    outputSchema: [
      { name: "baseId", label: "Base ID", type: "string", description: "The unique ID of the base" },
      { name: "tableId", label: "Table ID", type: "string", description: "The unique ID of the deleted table" },
      { name: "tableName", label: "Table Name", type: "string", description: "The name of the deleted table" },
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
        dependsOn: "baseId"
      },
      {
        name: "limit",
        label: "Limit",
        type: "number",
        required: false,
        placeholder: "Number of records (max 100)",
        defaultValue: 20,
        description: "Maximum number of records to return",
        dependsOn: "tableName"
      },
      {
        name: "filterType",
        label: "Filter Type",
        type: "select",
        required: false,
        options: [
          { value: "none", label: "No Filter" },
          { value: "keyword_search", label: "Search Keywords" },
          { value: "field_equals", label: "Filter by Field Value" },
          { value: "has_attachments", label: "Has Attachments" },
          { value: "is_empty", label: "Empty Records" },
          { value: "date_range", label: "Date Range" },
          { value: "advanced_formula", label: "Advanced Formula" }
        ],
        defaultValue: "none",
        placeholder: "Select filter type...",
        description: "Choose how to filter records",
        dependsOn: "tableName"
      },
      {
        name: "keywordSearch",
        label: "Search Keywords",
        type: "text",
        required: false,
        placeholder: "Search across all text fields...",
        description: "Search for keywords in all text fields",
        conditional: { field: "filterType", value: "keyword_search" },
        supportsAI: true
      },
      {
        name: "caseSensitive",
        label: "Case Sensitive Search",
        type: "boolean",
        required: false,
        defaultValue: false,
        description: "Whether search should be case sensitive",
        conditional: { field: "filterType", value: "keyword_search" }
      },
      {
        name: "filterField",
        label: "Field",
        type: "select",
        dynamic: "airtable_fields",
        required: false,
        placeholder: "Select field...",
        description: "Choose a field to filter by",
        dependsOn: "tableName",
        conditional: { field: "filterType", value: "field_equals" }
      },
      {
        name: "filterValue",
        label: "Value",
        type: "select",
        dynamic: "airtable_field_values",
        required: false,
        placeholder: "Select value...",
        description: "Choose the value to match",
        dependsOn: "filterField",
        conditional: { field: "filterType", value: "field_equals" }
      },
      {
        name: "dateFilter",
        label: "Date Range",
        type: "select",
        required: false,
        options: [
          { value: "today", label: "Created Today" },
          { value: "yesterday", label: "Created Yesterday" },
          { value: "last_7_days", label: "Last 7 Days" },
          { value: "last_30_days", label: "Last 30 Days" },
          { value: "this_month", label: "This Month" },
          { value: "last_month", label: "Last Month" },
          { value: "custom", label: "Custom Range" }
        ],
        defaultValue: "last_7_days",
        placeholder: "Select date range...",
        description: "Filter by creation date",
        conditional: { field: "filterType", value: "date_range" }
      },
      {
        name: "customDateRange",
        label: "Custom Date Range",
        type: "daterange",
        required: false,
        placeholder: "Select date range...",
        description: "Choose start and end dates",
        conditional: { field: "dateFilter", value: "custom" }
      },
      {
        name: "filterByFormula",
        label: "Filter Formula",
        type: "textarea",
        required: false,
        placeholder: "{Status} = 'Active'",
        description: "Airtable filter formula",
        conditional: { field: "filterType", value: "advanced_formula" },
        supportsAI: true
      },
      {
        name: "sortOrder",
        label: "Sort Order",
        type: "select",
        required: false,
        options: [
          { value: "newest", label: "Newest First" },
          { value: "oldest", label: "Oldest First" },
          { value: "recently_modified", label: "Recently Modified" },
          { value: "least_recently_modified", label: "Least Recently Modified" }
        ],
        defaultValue: "newest",
        placeholder: "Select sort order...",
        description: "How to sort the records",
        dependsOn: "tableName"
      }
    ]
  },
  // New schema-based actions
  updateMultipleRecords,
  findRecord,
  getRecord,
  deleteRecord,
  addAttachment,
  duplicateRecord,
  getTableSchema,
  createMultipleRecords,
]
