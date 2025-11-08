import { NodeComponent } from "../../../types"

export const duplicateRecordActionSchema: NodeComponent = {
  type: "airtable_action_duplicate_record",
  title: "Duplicate Record",
  description: "Create a copy of an existing record with all its field values",
  icon: "Copy" as any,
  isTrigger: false,
  providerId: "airtable",
  testable: true,
  requiredScopes: ["data.records:read", "data.records:write"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "newRecordId", label: "New Record ID", type: "string", description: "The ID of the duplicated record" },
    { name: "originalRecordId", label: "Original Record ID", type: "string", description: "The ID of the source record" },
    { name: "fields", label: "Fields", type: "object", description: "The field values of the new record" },
    { name: "createdTime", label: "Created Time", type: "string", description: "When the duplicate was created" }
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
      label: "Record ID to Duplicate",
      type: "text",
      required: true,
      placeholder: "Use {{variable}} or select from table below",
      supportsAI: true,
      description: "The ID of the record to duplicate. Use variables from previous steps or select a record from the table.",
      helpText: "Use variables like {{trigger.recordId}} from previous workflow steps, or click a record in the table below to auto-populate this field.",
      dependsOn: "tableName"
    },
    // Hidden field that stores the field selection and override configuration
    // Format: { fieldsToCopy: ["field1", "field2"], fieldsToOverride: { field1: "new value" } }
    {
      name: "duplicateConfig",
      label: "Duplicate Configuration",
      type: "hidden",
      required: false,
      description: "Internal storage for field selection and overrides"
    }
  ]
}
