import { NodeComponent } from "../../../types"

export const getTableSchemaActionSchema: NodeComponent = {
  type: "airtable_action_get_table_schema",
  title: "Get Table Schema",
  description: "Get metadata about a table's structure, fields, and configuration",
  icon: "Database" as any,
  isTrigger: false,
  providerId: "airtable",
  testable: true,
  requiredScopes: ["schema.bases:read"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "tableId", label: "Table ID", type: "string", description: "The unique ID of the table" },
    { name: "tableName", label: "Table Name", type: "string", description: "The name of the table" },
    { name: "primaryFieldId", label: "Primary Field ID", type: "string", description: "The ID of the primary field" },
    { name: "fields", label: "Fields", type: "array", description: "Array of all fields with their types and options" },
    { name: "views", label: "Views", type: "array", description: "Array of all views in the table" },
    { name: "recordCount", label: "Record Count", type: "number", description: "Total number of records in the table" }
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
      description: "The table to get schema information for"
    },
    {
      name: "includeViews",
      label: "Include Views",
      type: "boolean",
      required: false,
      defaultValue: true,
      dependsOn: "tableName",
      description: "Include information about table views",
      tooltip: "When enabled, returns details about all views including their filters and sorts."
    }
  ]
}
