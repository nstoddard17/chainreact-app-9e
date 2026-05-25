import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `airtable:delete_record` — Slice 4.AIRTABLE-META-3.
 * Mirrors `deleteRecord.schema.ts`. **High-risk destructive** —
 * permanently removes a record (Airtable's REST DELETE has no trash /
 * restore). Per Marcus's decision: high + isDestructive +
 * requiresConfirmation (deleting an Airtable record can permanently
 * remove business data). The only destructive Airtable action.
 */
export const airtableDeleteRecordMeta: ActionMeta = {
  key: "airtable:delete_record",
  provider: "airtable",
  type: "delete_record",
  displayName: "Delete Record",
  description:
    "Permanently delete an Airtable record by id. This is irreversible — Airtable's API has no trash or restore. Fails if the record does not exist. Requires confirmation.",
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
        "The record id to delete (e.g. recXXXXXXXXXXXXXX). Usually mapped from an upstream step.",
      type: "text",
      required: true,
      placeholder: "rec…",
    },
  ],
  outputs: [
    { name: "id", type: "string", description: "The deleted record id." },
    {
      name: "deleted",
      type: "boolean",
      description: "True when the record was deleted.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 110,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Permanently deletes a record — irreversible (no Airtable trash/restore). Confirmation required.",
};
