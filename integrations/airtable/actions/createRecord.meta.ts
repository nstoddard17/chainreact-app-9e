import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `airtable:create_record` — Slice 4.AIRTABLE-META-3.
 * Mirrors `createRecord.schema.ts`. Write action (medium risk).
 *
 * `fields` is the typed field map (`Record<fieldName, {type, value}>`).
 * There is no typed-field-map FieldType yet, so it is a textarea
 * paste-JSON (the Notion `properties` / Stripe `lineItems` bridge); a
 * structured editor is a future builder slice (NOT this one). `typecast`
 * is REQUIRED (no hidden default; UI default false). Output `fields`
 * echoes the stored cell values → sensitive.
 */
export const airtableCreateRecordMeta: ActionMeta = {
  key: "airtable:create_record",
  provider: "airtable",
  type: "create_record",
  displayName: "Create Record",
  description: "Create a new record in an Airtable table.",
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
      name: "fields",
      label: "Fields",
      description:
        'Field values as JSON keyed by field name, each {type, value} — e.g. {"Name":{"type":"singleLineText","value":"Acme"},"Done":{"type":"checkbox","value":true}}. Supported types: singleLineText, longText, number, currency, percent, singleSelect, multipleSelects, checkbox, date, dateTime, email, url, phoneNumber, multipleRecordLinks, attachment.',
      type: "json",
      required: true,
      advanced: true,
      jsonShape: "object",
      placeholder: '{ "Name": { "type": "singleLineText", "value": "…" } }',
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
    { name: "id", type: "string", description: "The new record id." },
    {
      name: "fields",
      type: "object",
      description: "Stored cell values keyed by field name (Airtable's echo).",
      sensitive: true,
    },
    {
      name: "createdTime",
      type: "string",
      description: "ISO-8601 created timestamp.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 60,
  riskLevel: "medium",
  riskDescription: "Creates a record (recoverable — delete the record to undo).",
};
