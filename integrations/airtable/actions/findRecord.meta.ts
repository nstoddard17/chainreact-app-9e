import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `airtable:find_record` — Slice 4.AIRTABLE-META-3.
 * Mirrors `findRecord.schema.ts`. Read action (low risk). `filterByFormula`
 * is REQUIRED (the schema forces an explicit formula; pass "TRUE()" for
 * "first record"). Returns `{found, record}` — `found:false` instead of
 * throwing on no match. Output `record.fields` → sensitive.
 */
export const airtableFindRecordMeta: ActionMeta = {
  key: "airtable:find_record",
  provider: "airtable",
  type: "find_record",
  displayName: "Find Record",
  description:
    "Find the first Airtable record matching a formula. Returns found:false (does not fail) when nothing matches.",
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
      name: "filterByFormula",
      label: "Filter by formula",
      description:
        'Airtable formula identifying the record, e.g. {Email}=\'a@b.com\'. Pass "TRUE()" to take the first record in the table.',
      type: "textarea",
      required: true,
      placeholder: "{Email}='a@b.com'",
    },
  ],
  outputs: [
    {
      name: "found",
      type: "boolean",
      description: "True when a record matched.",
    },
    {
      name: "record",
      type: "object",
      description: "The matched record, or null when none matched.",
      fields: [
        { name: "id", type: "string", description: "Record id." },
        {
          name: "fields",
          type: "object",
          description: "Record cell values keyed by field name.",
          sensitive: true,
        },
        {
          name: "createdTime",
          type: "string",
          description: "ISO-8601 created timestamp.",
        },
      ],
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 30,
  riskLevel: "low",
  riskDescription: "Read-only — finds at most one record.",
};
