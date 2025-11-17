import { NodeComponent } from "../../../types"

export const deleteRecordActionSchema: NodeComponent = {
  type: "airtable_action_delete_record",
  title: "Delete Record(s)",
  description: "Delete one or multiple records from an Airtable table",
  icon: "Trash2" as any,
  isTrigger: false,
  providerId: "airtable",
  testable: true,
  requiredScopes: ["data.records:write"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "recordId", label: "Deleted Record ID", type: "string", description: "The ID of the deleted record (or first record if multiple)" },
    { name: "deleted", label: "Deleted", type: "boolean", description: "Whether the record(s) were successfully deleted" },
    { name: "deletedAt", label: "Deleted At", type: "string", description: "When the deletion occurred" },
    { name: "deletedCount", label: "Deleted Count", type: "number", description: "Number of records deleted" },
    { name: "deletedRecordIds", label: "Deleted Record IDs", type: "array", description: "Array of all deleted record IDs" }
  ],
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
      dependsOn: "baseId"
    },
    {
      name: "deleteMode",
      label: "Delete Mode",
      type: "select",
      required: true,
      options: [
        { value: "single_record", label: "Delete specific record by ID" },
        { value: "matching_records", label: "Delete all records matching criteria" }
      ],
      defaultValue: "single_record",
      description: "Choose how to select records for deletion"
    },
    {
      name: "recordId",
      label: "Record ID",
      type: "text",
      required: true,
      placeholder: "{{trigger.recordId}} or rec123abc",
      supportsAI: true,
      description: "The ID of the record to delete",
      tooltip: "WARNING: This action permanently deletes the record and cannot be undone.",
      visibleWhen: { field: "deleteMode", value: "single_record" }
    },
    {
      name: "searchMode",
      label: "Search By",
      type: "select",
      required: true,
      options: [
        { value: "field_match", label: "Field Value Match" },
        { value: "formula", label: "Filter Formula" }
      ],
      defaultValue: "field_match",
      description: "How to find records to delete",
      visibleWhen: { field: "deleteMode", value: "matching_records" }
    },
    {
      name: "searchField",
      label: "Search Field",
      type: "select",
      dynamic: "airtable_fields",
      required: true,
      dependsOn: "tableName",
      placeholder: "Select field to search in...",
      description: "Field to search in",
      showWhen: {
        deleteMode: "matching_records",
        searchMode: "field_match"
      }
    },
    {
      name: "searchValue",
      label: "Search Keywords",
      type: "tags",
      required: true,
      placeholder: "Type keyword and press Enter...",
      supportsAI: true,
      description: "Keywords to match (records with these values will be deleted)",
      showWhen: {
        deleteMode: "matching_records",
        searchMode: "field_match"
      }
    },
    {
      name: "matchType",
      label: "Match Type",
      type: "select",
      required: false,
      options: [
        { value: "any", label: "Match any keyword" },
        { value: "all", label: "Match all keywords" },
        { value: "exact", label: "Exact phrase match" }
      ],
      defaultValue: "any",
      description: "How to match keywords",
      showWhen: {
        deleteMode: "matching_records",
        searchMode: "field_match"
      }
    },
    {
      name: "caseSensitive",
      label: "Case Sensitive",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Whether search should be case sensitive",
      showWhen: {
        deleteMode: "matching_records",
        searchMode: "field_match"
      }
    },
    {
      name: "filterFormula",
      label: "Filter Formula",
      type: "textarea",
      required: true,
      rows: 3,
      placeholder: "AND({Status} = 'Archived', {Age} > 30)",
      supportsAI: true,
      description: "Airtable formula to find records to delete",
      showWhen: {
        deleteMode: "matching_records",
        searchMode: "formula"
      }
    },
    {
      name: "maxRecords",
      label: "Safety Limit",
      type: "number",
      required: false,
      defaultValue: 10,
      min: 1,
      max: 100,
      description: "Maximum number of records to delete (safety measure)",
      tooltip: "Prevents accidentally deleting too many records. Set to the maximum you expect to delete.",
      visibleWhen: { field: "deleteMode", value: "matching_records" }
    }
  ]
}
