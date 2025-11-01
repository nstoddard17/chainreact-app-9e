import { NodeComponent } from "../../../types"

export const createMultipleRecordsActionSchema: NodeComponent = {
  type: "airtable_action_create_multiple_records",
  title: "Create Multiple Records",
  description: "Create multiple records at once in an Airtable table (bulk create)",
  icon: "Plus" as any,
  isTrigger: false,
  providerId: "airtable",
  testable: true,
  requiredScopes: ["data.records:write"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "createdRecords", label: "Created Records", type: "array", description: "Array of all created records with their IDs and field values" },
    { name: "createCount", label: "Create Count", type: "number", description: "Number of records successfully created" },
    { name: "success", label: "Success", type: "boolean", description: "Whether all creates completed successfully" }
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
      dependsOn: "baseId",
      description: "The table to create records in"
    },
    {
      name: "records",
      label: "Records to Create",
      type: "textarea",
      required: true,
      rows: 12,
      placeholder: JSON.stringify([
        { Name: "Record 1", Status: "Active" },
        { Name: "Record 2", Status: "Pending" },
        { Name: "Record 3", Status: "Active" }
      ], null, 2),
      supportsAI: true,
      description: "Array of field objects for records to create (max 10)",
      tooltip: "Enter a JSON array where each object represents one record. Airtable API allows up to 10 records per request."
    }
  ]
}
