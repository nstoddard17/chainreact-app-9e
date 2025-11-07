import { NodeComponent } from "../../../types"

export const getRecordActionSchema: NodeComponent = {
  type: "airtable_action_get_record",
  title: "Get Record",
  description: "Get a specific record by its ID",
  icon: "FileText" as any,
  isTrigger: false,
  providerId: "airtable",
  testable: true,
  requiredScopes: ["data.records:read"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "recordId", label: "Record ID", type: "string", description: "The unique ID of the record" },
    { name: "fields", label: "Fields", type: "object", description: "All field values of the record" },
    { name: "createdTime", label: "Created Time", type: "string", description: "When the record was created" }
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
      description: "The ID of the record to retrieve",
      tooltip: "Airtable record IDs start with 'rec' followed by alphanumeric characters.",
      dependsOn: "tableName"
    }
  ]
}
