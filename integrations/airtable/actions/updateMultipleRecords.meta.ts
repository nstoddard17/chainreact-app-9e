import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `airtable:update_multiple_records` — Slice
 * 4.AIRTABLE-META-3. Mirrors `updateMultipleRecords.schema.ts`. Write
 * action (medium risk). True batch — 1..10 records, all-or-nothing.
 * Each entry needs an explicit `recordId` (no upsert). `records` →
 * textarea paste-JSON. `typecast` REQUIRED. Output `records[].fields`
 * → sensitive.
 */
export const airtableUpdateMultipleRecordsMeta: ActionMeta = {
  key: "airtable:update_multiple_records",
  provider: "airtable",
  type: "update_multiple_records",
  displayName: "Update Multiple Records",
  description:
    "Update up to 10 records in one request (PATCH per record, all-or-nothing). Each entry needs a recordId.",
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
        'Up to 10 records as a JSON array, each {"recordId":"rec…","fields":{<name>:{type,value}}} — e.g. [{"recordId":"rec123","fields":{"Status":{"type":"singleSelect","value":"Done"}}}]. Only the included fields per record are changed.',
      type: "textarea",
      required: true,
      placeholder:
        '[{ "recordId": "rec…", "fields": { "Status": { "type": "singleSelect", "value": "Done" } } }]',
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
      name: "updatedCount",
      type: "number",
      description: "Number of records updated.",
    },
    {
      name: "records",
      type: "array",
      description: "The updated records.",
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
  displayOrder: 90,
  riskLevel: "medium",
  riskDescription: "Updates up to 10 records (recoverable).",
};
