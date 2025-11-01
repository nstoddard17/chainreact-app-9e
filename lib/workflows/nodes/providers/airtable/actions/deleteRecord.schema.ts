import { NodeComponent } from "../../../types"

export const deleteRecordActionSchema: NodeComponent = {
  type: "airtable_action_delete_record",
  title: "Delete Record",
  description: "Delete a record from an Airtable table",
  icon: "Trash2" as any,
  isTrigger: false,
  providerId: "airtable",
  testable: true,
  requiredScopes: ["data.records:write"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "recordId", label: "Deleted Record ID", type: "string", description: "The ID of the deleted record" },
    { name: "deleted", label: "Deleted", type: "boolean", description: "Whether the record was successfully deleted" },
    { name: "deletedAt", label: "Deleted At", type: "string", description: "When the record was deleted" }
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
      name: "recordId",
      label: "Record ID",
      type: "text",
      required: true,
      placeholder: "{{trigger.recordId}} or rec123abc",
      supportsAI: true,
      description: "The ID of the record to delete",
      tooltip: "WARNING: This action permanently deletes the record and cannot be undone."
    }
  ]
}
