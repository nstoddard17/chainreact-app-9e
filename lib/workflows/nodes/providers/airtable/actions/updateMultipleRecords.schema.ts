import { NodeComponent } from "../../../types"

const AIRTABLE_UPDATE_MULTIPLE_RECORDS_METADATA = {
  key: "airtable_action_update_multiple_records",
  name: "Update Multiple Records",
  description: "Update multiple records at once in an Airtable table (bulk update)"
}

export const updateMultipleRecordsActionSchema: NodeComponent = {
  type: AIRTABLE_UPDATE_MULTIPLE_RECORDS_METADATA.key,
  title: "Update Multiple Records",
  description: AIRTABLE_UPDATE_MULTIPLE_RECORDS_METADATA.description,
  icon: "Edit" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "airtable",
  testable: true,
  requiredScopes: ["data.records:write"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    {
      name: "updatedRecords",
      label: "Updated Records",
      type: "array",
      description: "Array of all updated records with their new field values",
      example: [{ id: "rec123", fields: { Name: "Updated" } }]
    },
    {
      name: "updateCount",
      label: "Update Count",
      type: "number",
      description: "Number of records successfully updated",
      example: 5
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether all updates completed successfully",
      example: true
    }
  ],
  configSchema: [
    {
      name: "baseId",
      label: "Base",
      type: "select",
      dynamic: "airtable_bases",
      required: true,
      loadOnMount: true,
      placeholder: "Select a base",
      description: "The Airtable base containing the table"
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
      name: "updateMode",
      label: "Update Mode",
      type: "select",
      required: true,
      options: [
        { value: "by_ids", label: "Update Specific Records (by ID)" },
        { value: "by_filter", label: "Update Records Matching Filter" }
      ],
      defaultValue: "by_ids",
      description: "How to select records to update"
    },
    {
      name: "recordIds",
      label: "Record IDs",
      type: "textarea",
      required: true,
      rows: 4,
      placeholder: "rec123abc\nrec456def\nrec789ghi",
      supportsAI: true,
      description: "List of record IDs to update (one per line, max 10)",
      tooltip: "Enter up to 10 record IDs, one per line. Airtable API limit.",
      visibleWhen: {
        field: "updateMode",
        value: "by_ids"
      }
    },
    {
      name: "filterFormula",
      label: "Filter Formula",
      type: "textarea",
      required: true,
      rows: 3,
      placeholder: "{Status} = 'Pending'",
      supportsAI: true,
      description: "Airtable formula to filter records to update",
      tooltip: "Use Airtable formula syntax. Example: {Status} = 'Pending', {Due Date} < TODAY()",
      visibleWhen: {
        field: "updateMode",
        value: "by_filter"
      }
    },
    {
      name: "maxRecords",
      label: "Maximum Records to Update",
      type: "number",
      required: false,
      defaultValue: 10,
      min: 1,
      max: 10,
      placeholder: "10",
      description: "Max number of matching records to update (1-10)",
      tooltip: "Airtable API allows updating up to 10 records per request.",
      visibleWhen: {
        field: "updateMode",
        value: "by_filter"
      }
    },
    {
      name: "fields",
      label: "Fields to Update",
      type: "object",
      required: true,
      placeholder: JSON.stringify({ Status: "Complete", "Updated At": "{{now}}" }, null, 2),
      supportsAI: true,
      description: "Field values to update for all matched records",
      tooltip: "These field values will be applied to ALL matched records. Use variables like {{trigger.value}} for dynamic values."
    }
  ]
}
