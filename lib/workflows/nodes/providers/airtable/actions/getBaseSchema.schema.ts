import { NodeComponent } from "../../../types"

export const getBaseSchemaActionSchema: NodeComponent = {
  type: "airtable_action_get_base_schema",
  title: "Get Base Schema",
  description: "Get complete schema for an entire base, including all tables and their field definitions",
  icon: "Database" as any,
  isTrigger: false,
  providerId: "airtable",
  testable: true,
  requiredScopes: ["schema.bases:read"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "baseId", label: "Base ID", type: "string", description: "The unique ID of the base" },
    { name: "baseName", label: "Base Name", type: "string", description: "The name of the base" },
    { name: "tables", label: "Tables", type: "array", description: "Array of all tables with their complete schemas" },
    { name: "tableCount", label: "Table Count", type: "number", description: "Total number of tables in the base" },
    { name: "totalFieldCount", label: "Total Field Count", type: "number", description: "Total number of fields across all tables" }
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
      name: "includeTableViews",
      label: "Include Table Views",
      type: "boolean",
      required: false,
      defaultValue: false,
      dependsOn: "baseId",
      description: "Include view information for each table",
      tooltip: "When enabled, returns details about all views including their filters and sorts. This increases response size."
    }
  ]
}
