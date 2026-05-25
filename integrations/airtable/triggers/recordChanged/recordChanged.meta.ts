import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder metadata for `airtable:record_changed` — Slice 4.AIRTABLE-META-3.
 *
 * Single consolidated webhook trigger. Per-base subscription created at
 * activation (`POST /v0/bases/{baseId}/webhooks`), renewed before its
 * 7-day TTL, deleted on deactivate. Activation is registered in
 * `triggers/recordChanged/index.ts` via
 * `registerActivation("airtable","record_changed",…)` (loaded by
 * `integrations/_registry.ts`), so the trigger-meta-activation-invariant
 * passes with no exemption.
 *
 * Config fields mirror the runtime `activate` reads:
 *   - `baseId` (REQUIRED) → airtable:bases.
 *   - `tableIdOrName` (OPTIONAL) → airtable:tables (dep baseId). Omit to
 *     watch every table in the base.
 *
 * The trigger fans out one event per record change; workflows branch on
 * `payload.eventType` (created / updated / deleted / table_deleted /
 * unknown). Cell-value payload fields (`fields`, `parsedFields`,
 * `previousValues`, `changedFieldsById`) carry record content →
 * sensitive. Ids / eventType / counts / timestamps are structural.
 */
export const airtableRecordChangedTriggerMeta: TriggerMeta = {
  key: "airtable:record_changed",
  provider: "airtable",
  type: "record_changed",
  displayName: "Record Changed",
  description:
    "Fires when records in a base (or one table) are created, updated, or deleted. Branch on the eventType field. Optionally scope to a single table.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "baseId",
      label: "Base",
      description: "The Airtable base to watch.",
      type: "combobox",
      required: true,
      optionsSource: "airtable:bases",
      placeholder: "Search bases…",
    },
    {
      name: "tableIdOrName",
      label: "Table",
      description:
        "Optional — limit the watch to one table. Leave empty to watch all tables in the base. Pick a base first.",
      type: "combobox",
      required: false,
      optionsSource: "airtable:tables",
      dependsOn: "baseId",
      placeholder: "All tables (or pick one)",
    },
  ],
  payloadShape: [
    {
      name: "eventType",
      type: "string",
      description:
        "created | updated | deleted | table_deleted | unknown — branch on this.",
    },
    { name: "baseId", type: "string", description: "The base id." },
    { name: "tableId", type: "string", description: "The table id." },
    {
      name: "recordId",
      type: "string",
      description: "The changed record id (absent for table_deleted).",
    },
    {
      name: "createdTime",
      type: "string",
      description: "ISO-8601 created timestamp (created events).",
    },
    {
      name: "fields",
      type: "object",
      description: "The record's current cell values keyed by field id.",
      sensitive: true,
    },
    {
      name: "parsedFields",
      type: "object",
      description:
        "Typed cell values (present only when a field schema was available).",
      sensitive: true,
    },
    {
      name: "changedFieldsById",
      type: "object",
      description: "The fields that changed (updated events).",
      sensitive: true,
    },
    {
      name: "previousValues",
      type: "object",
      description: "Prior cell values before the change (updated events).",
      sensitive: true,
    },
    {
      name: "skippedFields",
      type: "array",
      description:
        "Fields skipped because their type isn't supported for typed parsing.",
    },
    {
      name: "destroyedTableIds",
      type: "array",
      description: "Ids of tables destroyed (table_deleted events).",
    },
    {
      name: "baseTransactionNumber",
      type: "number",
      description: "Airtable base transaction number for the change.",
    },
    {
      name: "deleted",
      type: "boolean",
      description: "True on deleted events.",
    },
  ],
  displayOrder: 10,
};
