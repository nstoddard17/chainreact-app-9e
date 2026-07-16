import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `airtable:get_record` — Slice 4.AIRTABLE-META-3.
 * Mirrors `getRecord.schema.ts`. Read action (low risk). `recordId` is a
 * searchable record picker (`airtable:records`, RESOLVERS-1 — Marcus
 * explicitly required record pickers, reversing the AIRTABLE-META-1
 * v1 rejection) with manual entry so upstream-mapped ids still work.
 * Output `fields` carries record cell values → sensitive.
 */
export const airtableGetRecordMeta: ActionMeta = {
  key: "airtable:get_record",
  provider: "airtable",
  type: "get_record",
  displayName: "Get Record",
  description:
    "Fetch a single Airtable record by id. Fails if the record does not exist.",
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
      label: "Record",
      description:
        "The record to fetch. Pick from the list, paste a record id (e.g. recXXXXXXXXXXXXXX), or map one from an upstream trigger or list/find step. Pick a base and table first.",
      type: "combobox",
      required: true,
      optionsSource: "airtable:records",
      dependsOn: ["baseId", "tableIdOrName"],
      allowManualEntry: true,
      placeholder: "Select base + table first",
    },
  ],
  outputs: [
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
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 20,
  riskLevel: "low",
  riskDescription: "Read-only — fetches one record.",
};
