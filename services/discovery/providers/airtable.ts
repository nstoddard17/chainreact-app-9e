import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Airtable discovery sub-registry — Slice 4.AIRTABLE-META-3.
 *
 * Per-provider extraction of the Airtable meta imports so the central
 * `services/discovery/_registry.ts` stays manageable (same pattern as
 * `providers/microsoft-excel.ts` / `providers/shopify.ts` /
 * `providers/monday.ts`). The central registry spreads
 * `AIRTABLE_ACTION_METAS` / `AIRTABLE_TRIGGER_METAS`; module-load
 * validation + duplicate-key rejection happen centrally — this file is
 * import grouping only.
 *
 * **Coverage:** 11 actions + 1 webhook trigger. Field names are camelCase
 * to mirror the Airtable runtime Zod schemas 1:1 (drift fails the
 * meta-coverage structural test once `airtable` is in `COVERED_PROVIDERS`).
 *
 * Picker wiring (resolvers from AIRTABLE-META-2):
 *   - `baseId` → airtable:bases (no deps).
 *   - `tableIdOrName` → airtable:tables (dep `baseId`).
 *   - `view` / `fields` → airtable:views / airtable:fields (multi-parent
 *     dep `["baseId","tableIdOrName"]`, enabled by BUILDER-OPTIONS-1).
 *   - `add_attachment.fieldName` → airtable:attachment_fields (multi-parent).
 *   - `recordId` is typed (no record picker; `airtable:records` rejected).
 *
 * `delete_record` is high/destructive/requiresConfirmation (Marcus
 * decision — deleting a record can permanently remove business data;
 * Airtable's REST DELETE has no trash/restore). `add_attachment` is the
 * only FileRef consumer. Record cell values (action + trigger) are
 * marked sensitive; schema-metadata reads are not.
 *
 * The `record_changed` trigger registers its activation in
 * `integrations/airtable/triggers/recordChanged/index.ts` (loaded by
 * `integrations/_registry.ts`), so the trigger-meta-activation-invariant
 * test is satisfied without an exemption.
 */

import { airtableListRecordsMeta } from "@/integrations/airtable/actions/listRecords.meta";
import { airtableGetRecordMeta } from "@/integrations/airtable/actions/getRecord.meta";
import { airtableFindRecordMeta } from "@/integrations/airtable/actions/findRecord.meta";
import { airtableGetBaseSchemaMeta } from "@/integrations/airtable/actions/getBaseSchema.meta";
import { airtableGetTableSchemaMeta } from "@/integrations/airtable/actions/getTableSchema.meta";
import { airtableCreateRecordMeta } from "@/integrations/airtable/actions/createRecord.meta";
import { airtableUpdateRecordMeta } from "@/integrations/airtable/actions/updateRecord.meta";
import { airtableCreateMultipleRecordsMeta } from "@/integrations/airtable/actions/createMultipleRecords.meta";
import { airtableUpdateMultipleRecordsMeta } from "@/integrations/airtable/actions/updateMultipleRecords.meta";
import { airtableAddAttachmentMeta } from "@/integrations/airtable/actions/addAttachment.meta";
import { airtableDeleteRecordMeta } from "@/integrations/airtable/actions/deleteRecord.meta";

import { airtableRecordChangedTriggerMeta } from "@/integrations/airtable/triggers/recordChanged/recordChanged.meta";

/** Airtable action metas in displayOrder (10..110). */
export const AIRTABLE_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  airtableListRecordsMeta,
  airtableGetRecordMeta,
  airtableFindRecordMeta,
  airtableGetBaseSchemaMeta,
  airtableGetTableSchemaMeta,
  airtableCreateRecordMeta,
  airtableUpdateRecordMeta,
  airtableCreateMultipleRecordsMeta,
  airtableUpdateMultipleRecordsMeta,
  airtableAddAttachmentMeta,
  airtableDeleteRecordMeta,
];

/** Airtable trigger metas — 1 webhook trigger (record_changed). */
export const AIRTABLE_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  airtableRecordChangedTriggerMeta,
];
