import { NodeComponent } from "../../../types"

export const findRecordActionSchema: NodeComponent = {
  type: "airtable_action_find_record",
  title: "Find Record",
  description: "Find a single record matching search criteria",
  icon: "Search" as any,
  isTrigger: false,
  providerId: "airtable",
  testable: true,
  requiredScopes: ["data.records:read"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "recordId", label: "Record ID", type: "string", description: "The ID of the found record" },
    { name: "fields", label: "Fields", type: "object", description: "All field values of the record" },
    { name: "createdTime", label: "Created Time", type: "string", description: "When the record was created" },
    { name: "found", label: "Found", type: "boolean", description: "Whether a matching record was found" }
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
      name: "searchMode",
      label: "Search By",
      type: "select",
      required: true,
      options: [
        { value: "field_match", label: "Field Value Match" },
        { value: "formula", label: "Filter Formula" }
      ],
      defaultValue: "field_match",
      description: "How to search for the record"
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
      visibleWhen: { field: "searchMode", value: "field_match" }
    },
    {
      name: "searchValue",
      label: "Search Value",
      type: "text",
      required: true,
      placeholder: "{{trigger.email}}",
      supportsAI: true,
      description: "Value to search for",
      visibleWhen: { field: "searchMode", value: "field_match" }
    },
    {
      name: "filterFormula",
      label: "Filter Formula",
      type: "textarea",
      required: true,
      rows: 3,
      placeholder: "AND({Email} = 'user@example.com', {Status} = 'Active')",
      supportsAI: true,
      description: "Airtable formula to find the record",
      visibleWhen: { field: "searchMode", value: "formula" }
    },
    {
      name: "returnFirst",
      label: "If Multiple Matches",
      type: "select",
      required: false,
      options: [
        { value: "first", label: "Return first match" },
        { value: "newest", label: "Return newest (by created time)" },
        { value: "oldest", label: "Return oldest (by created time)" }
      ],
      defaultValue: "first",
      description: "Which record to return if multiple match"
    }
  ]
}
