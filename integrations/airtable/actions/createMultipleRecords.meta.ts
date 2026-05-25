import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `airtable:create_multiple_records` — Slice
 * 4.AIRTABLE-META-3. Mirrors `createMultipleRecords.schema.ts`. Write
 * action (medium risk). True batch — 1..10 records, all-or-nothing
 * (Airtable 422 if any record fails). `records` is an array of
 * `{fields}` (typed map) → textarea paste-JSON (no array-of-object
 * FieldType). `typecast` REQUIRED. Output `records[].fields` →
 * sensitive.
 */
export const airtableCreateMultipleRecordsMeta: ActionMeta = {
  key: "airtable:create_multiple_records",
  provider: "airtable",
  type: "create_multiple_records",
  displayName: "Create Multiple Records",
  description:
    "Create up to 10 records in one request (all-or-nothing — the whole batch fails if any record is invalid).",
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
      name: "records",
      label: "Records",
      description:
        'Up to 10 records as a JSON array, each {"fields": {<name>: {type, value}}} — e.g. [{"fields":{"Name":{"type":"singleLineText","value":"A"}}},{"fields":{"Name":{"type":"singleLineText","value":"B"}}}]. Supported field types match Create Record.',
      type: "textarea",
      required: true,
      placeholder:
        '[{ "fields": { "Name": { "type": "singleLineText", "value": "A" } } }]',
    },
    {
      name: "typecast",
      label: "Typecast",
      description:
        "When on, Airtable coerces strings into select options / linked records automatically. Off (recommended) requires exact values.",
      type: "boolean",
      required: true,
      defaultValue: false,
    },
  ],
  outputs: [
    { name: "baseId", type: "string", description: "The base id." },
    { name: "tableIdOrName", type: "string", description: "The table id or name." },
    {
      name: "createdCount",
      type: "number",
      description: "Number of records created.",
    },
    {
      name: "records",
      type: "array",
      description: "The created records.",
      fields: [
        { name: "id", type: "string", description: "Record id." },
        {
          name: "fields",
          type: "object",
          description: "Stored cell values keyed by field name.",
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
  displayOrder: 80,
  riskLevel: "medium",
  riskDescription: "Creates up to 10 records (recoverable).",
};
