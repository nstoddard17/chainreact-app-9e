import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `airtable:update_record` — Slice 4.AIRTABLE-META-3.
 * Mirrors `updateRecord.schema.ts`. Write action (medium risk). PATCH
 * semantics — only the supplied fields are updated; pass null to clear a
 * nullable field. `fields` is the typed map (textarea paste-JSON; same
 * bridge as create_record). `typecast` REQUIRED. Output `fields` →
 * sensitive.
 */
export const airtableUpdateRecordMeta: ActionMeta = {
  key: "airtable:update_record",
  provider: "airtable",
  type: "update_record",
  displayName: "Update Record",
  description:
    "Update fields on an existing Airtable record (PATCH — only the supplied fields change). Fails if the record does not exist.",
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
      name: "recordId",
      label: "Record ID",
      description:
        "The record id to update (e.g. recXXXXXXXXXXXXXX). Usually mapped from an upstream step.",
      type: "text",
      required: true,
      placeholder: "rec…",
    },
    {
      name: "fields",
      label: "Fields",
      description:
        'Fields to update as JSON keyed by field name, each {type, value} — e.g. {"Status":{"type":"singleSelect","value":"Done"}}. Only the fields you include are changed. Supported types: singleLineText, longText, number, currency, percent, singleSelect, multipleSelects, checkbox, date, dateTime, email, url, phoneNumber, multipleRecordLinks, attachment.',
      type: "textarea",
      required: true,
      advanced: true,
      placeholder: '{ "Status": { "type": "singleSelect", "value": "Done" } }',
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
    { name: "id", type: "string", description: "The record id." },
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
  displayOrder: 70,
  riskLevel: "medium",
  riskDescription: "Updates record fields (recoverable).",
};
