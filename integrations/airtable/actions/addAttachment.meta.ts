import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `airtable:add_attachment` — Slice 4.AIRTABLE-META-3.
 * Mirrors `addAttachment.schema.ts`. Write action (medium risk).
 * FileRef CONSUMER (`file` field → P-S3 FileRef). REPLACES the
 * attachment field's contents with the single supplied file (NPD-A5/A6
 * — no append/merge).
 *
 * `fieldName` uses `airtable:attachment_fields` (multi-parent dep
 * [baseId, tableIdOrName], via BUILDER-OPTIONS-1) so authors pick a
 * valid attachment column. `recordId` is typed (no record picker).
 * Output `attachments` carries Airtable's own attachment URLs →
 * sensitive.
 */
export const airtableAddAttachmentMeta: ActionMeta = {
  key: "airtable:add_attachment",
  provider: "airtable",
  type: "add_attachment",
  displayName: "Add Attachment",
  description:
    "Attach a file to an attachment field on a record. Replaces the field's existing attachments with the supplied file. Stage bytes first via a download step (provider_url refs are rejected).",
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
        "Which record to attach the file to. Pick a record, paste a rec… id, or insert one from an earlier step.",
      type: "combobox",
      required: true,
      placeholder: "rec…",
      optionsSource: "airtable:records",
      allowManualEntry: true,
      dependsOn: ["baseId", "tableIdOrName"],
    },
    {
      name: "fieldName",
      label: "Attachment field",
      description:
        "The attachment field on the record. Pick a base and table first.",
      type: "combobox",
      required: true,
      optionsSource: "airtable:attachment_fields",
      dependsOn: ["baseId", "tableIdOrName"],
      placeholder: "Select base + table first",
    },
    {
      name: "file",
      label: "File",
      description:
        "The file to attach. Use an upstream file output (e.g. a download/staging step). provider_url refs are not supported — stage bytes first.",
      type: "file",
      required: true,
    },
    {
      name: "filename",
      label: "Filename",
      description:
        "Optional filename Airtable should store. Defaults to the file's own name.",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    { name: "baseId", type: "string", description: "The base id." },
    { name: "tableIdOrName", type: "string", description: "The table id or name." },
    { name: "recordId", type: "string", description: "The record id." },
    { name: "fieldName", type: "string", description: "The attachment field." },
    {
      name: "attachmentCount",
      type: "number",
      description: "Number of attachments now on the field.",
    },
    {
      name: "attachments",
      type: "array",
      description:
        "The field's attachments after the write — each { id, url, filename, size, type } (Airtable-hosted file URLs).",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: true,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 100,
  riskLevel: "medium",
  riskDescription:
    "Writes an attachment, replacing the field's existing files (recoverable by re-attaching).",
};
