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
      placeholder: "{{trigger.recordId}} or rec123abc",
      supportsAI: true,
      description: "The ID of the record to duplicate"
    },
    {
      name: "fieldsToCopy",
      label: "Fields to Copy",
      type: "select",
      required: false,
      options: [
        { value: "all", label: "All Fields" },
        { value: "specific", label: "Specific Fields Only" }
      ],
      defaultValue: "all",
      description: "Which fields to copy to the duplicate"
    },
    {
      name: "specificFields",
      label: "Specific Fields",
      type: "multiselect",
      dynamic: "airtable_fields",
      required: false,
      dependsOn: "tableName",
      placeholder: "Select fields to copy...",
      description: "Select which fields to copy",
      visibleWhen: { field: "fieldsToCopy", value: "specific" }
    },
    {
      name: "fieldsToOverride",
      label: "Fields to Override (Optional)",
      type: "object",
      required: false,
      placeholder: JSON.stringify({ Name: "Copy of {{trigger.Name}}", Status: "Draft" }, null, 2),
      supportsAI: true,
      description: "Field values to override in the duplicate",
      tooltip: "These values will replace the copied values. Useful for marking duplicates or changing status."
    }
  ]
}
