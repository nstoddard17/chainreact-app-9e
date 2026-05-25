import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `airtable:get_base_schema` — Slice 4.AIRTABLE-META-3.
 * Mirrors `getBaseSchema.schema.ts`. Read action (low risk). Base-level
 * only — no `tableIdOrName`. `includeViews` is REQUIRED at the schema
 * layer (no hidden default); UI default false. Output is schema metadata
 * (table/field names + types) — NOT record content, so NOT sensitive.
 */
export const airtableGetBaseSchemaMeta: ActionMeta = {
  key: "airtable:get_base_schema",
  provider: "airtable",
  type: "get_base_schema",
  displayName: "Get Base Schema",
  description:
    "List every table in a base with its fields (and optionally views). Useful for discovering table/field names for downstream steps.",
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
      name: "includeViews",
      label: "Include views",
      description:
        "When on, each table includes its views. Off keeps the response lean.",
      type: "boolean",
      required: true,
      defaultValue: false,
    },
  ],
  outputs: [
    { name: "baseId", type: "string", description: "The base id." },
    {
      name: "tables",
      type: "array",
      description:
        "Tables in the base — each { id, name, primaryFieldId, fields[], views? } (schema metadata).",
    },
    { name: "tableCount", type: "number", description: "Number of tables." },
    {
      name: "totalFieldCount",
      type: "number",
      description: "Total fields across all tables.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 40,
  riskLevel: "low",
  riskDescription: "Read-only — returns base schema metadata.",
};
