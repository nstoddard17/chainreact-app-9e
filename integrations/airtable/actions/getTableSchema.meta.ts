import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `airtable:get_table_schema` — Slice 4.AIRTABLE-META-3.
 * Mirrors `getTableSchema.schema.ts`. Read action (low risk). `includeViews`
 * REQUIRED (no hidden default); UI default false. Output is schema
 * metadata — NOT record content, so NOT sensitive.
 */
export const airtableGetTableSchemaMeta: ActionMeta = {
  key: "airtable:get_table_schema",
  provider: "airtable",
  type: "get_table_schema",
  displayName: "Get Table Schema",
  description:
    "Fetch one table's schema (fields, primary field, optionally views). Fails if the table does not exist in the base.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "baseId",
      label: "Base",
      description: "The Airtable base.",
      type: "combobox",
      required: true,
      optionsSource: "airtable:bases",
      placeholder: "Search bases…",
    },
    {
      name: "tableIdOrName",
      label: "Table",
      description: "The table in the base. Pick a base first.",
      type: "combobox",
      required: true,
      optionsSource: "airtable:tables",
      dependsOn: "baseId",
      placeholder: "Select base first",
    },
    {
      name: "includeViews",
      label: "Include views",
      description: "When on, the table includes its views. Off keeps it lean.",
      type: "boolean",
      required: true,
      defaultValue: false,
    },
  ],
  outputs: [
    { name: "baseId", type: "string", description: "The base id." },
    {
      name: "table",
      type: "object",
      description:
        "The table — { id, name, primaryFieldId, fields[], views? } (schema metadata).",
    },
    {
      name: "fieldCount",
      type: "number",
      description: "Number of fields on the table.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 50,
  riskLevel: "low",
  riskDescription: "Read-only — returns one table's schema metadata.",
};
