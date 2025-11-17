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
      name: "recordIds",
      label: "Record IDs",
      type: "text",
      required: true,
      placeholder: "Select records from the table below",
      description: "Selected record IDs will be stored here",
      readonly: true,
      hidden: true
    },
    {
      name: "preserveExistingAttachments",
      label: "Append or Replace Attachments",
      type: "select",
      required: false,
      options: [
        { value: "true", label: "Append to existing attachments" },
        { value: "false", label: "Replace all existing attachments" }
      ],
      defaultValue: "true",
      description: "Choose whether to keep or replace existing attachments when updating attachment fields",
      tooltip: "Append will add new attachments to existing ones. Replace will remove all existing attachments and add only the new ones.",
      dependsOn: "tableName",
      metadata: {
        showOnlyIfAttachmentFieldsPresent: true
      }
    }
  ]
}
