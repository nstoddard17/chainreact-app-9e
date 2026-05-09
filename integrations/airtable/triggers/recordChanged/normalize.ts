import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  parseFieldsWithSchema,
  type AirtableFieldSchema,
  type ParsedFieldValue,
} from "@/integrations/_shared/airtable/fields";
import type {
  WebhookPayload,
  WebhookPayloadRecord,
  WebhookPayloadTableSection,
} from "@/integrations/_shared/airtable/api/webhooks";

/**
 * Convert an Airtable webhook payload into canonical V2 TriggerEvents
 * — Slice 10 Commit 4.
 *
 * One consolidated `record_changed` trigger per the plan; the eventType
 * discriminator inside `payload.eventType` distinguishes
 * `created` / `updated` / `deleted` / `unknown`. Workflows branch on
 * the discriminator; the dedup key includes it so successive
 * change-classes against the same record fire as distinct events.
 *
 * Walks each payload's `changedTablesById`:
 *   - `createdRecordsById` → `eventType: "created"`, fields parsed
 *     from `cellValuesByFieldId` (or top-level `cellValuesByFieldId`
 *     for some Airtable response shapes).
 *   - `changedRecordsById` → `eventType: "updated"`, fields parsed
 *     from `current.cellValuesByFieldId`.
 *   - `destroyedRecordIds` → `eventType: "deleted"`, fields = {} .
 *
 * Schema is OPTIONAL — when provided, `parseFieldsWithSchema` runs
 * each field through the typed parser; deferred-type fields land in
 * `skippedFields[]` rather than throwing. When the schema is absent,
 * the raw `cellValuesByFieldId` map is forwarded as the payload's
 * `fields` value (workflows can drill into it via `{{trigger.fields}}`).
 *
 * Dedup key shape (Slice 10 plan §"Confirmed scope decisions" #15):
 *   `${webhookId}:${tableId|"all"}:${recordId}:${eventType}:${baseTransactionNumber}`
 * Falls back to `${notificationOccurredAt}` when baseTransactionNumber
 * is absent (Airtable should always provide it; defensive). The
 * combination guarantees:
 *   - successive transactions against the same record fire distinct
 *     events (different `baseTransactionNumber`),
 *   - duplicate webhook deliveries collapse via the dedup table
 *     (same key).
 *
 * The `unknown` eventType is reserved for a record that appears in a
 * payload without matching any of the three buckets — defensive only;
 * not exercised in normal Airtable responses.
 */

export type RecordChangedEventType =
  | "created"
  | "updated"
  | "deleted"
  | "unknown";

export interface NormalizeContext {
  webhookId: string;
  baseId: string;
  /** Account id (userId) from the integration row this trigger fired against. */
  accountId: string;
  /**
   * ISO-8601 — webhook receive time (NOT the payload timestamp).
   * Used as the eventId fallback when baseTransactionNumber is absent.
   */
  notificationOccurredAt: string;
  /**
   * Optional schema lookup keyed by field id (Airtable webhooks return
   * field ids in `cellValuesByFieldId`). When present, normalize emits
   * typed parsedFields + skippedFields; when absent, raw cellValues
   * are forwarded as `fields`.
   *
   * Keys: tableId → array of field metadata. The trigger config can
   * pre-populate this when it has a known schema; today it's left
   * undefined and the raw passthrough applies.
   */
  schemaByTableId?: Record<string, ReadonlyArray<AirtableFieldSchema>>;
}

export interface NormalizedPayload {
  /** TriggerEvents produced by this payload (zero or more). */
  events: TriggerEvent[];
}

function buildEventId(
  ctx: NormalizeContext,
  tableId: string | null,
  recordId: string,
  eventType: RecordChangedEventType,
  baseTransactionNumber: number | undefined,
): string {
  const txDiscriminator =
    baseTransactionNumber !== undefined
      ? String(baseTransactionNumber)
      : ctx.notificationOccurredAt;
  const tableSegment = tableId ?? "all";
  return `${ctx.webhookId}:${tableSegment}:${recordId}:${eventType}:${txDiscriminator}`;
}

function extractCellValues(record: WebhookPayloadRecord): Record<string, unknown> {
  // Airtable returns the new cell values under `current.cellValuesByFieldId`
  // for change events, and `cellValuesByFieldId` directly for create
  // events. Try `current` first, fall back to the top-level field, then
  // an empty object.
  return (
    record.current?.cellValuesByFieldId ??
    record.cellValuesByFieldId ??
    {}
  );
}

function buildFieldsPayload(
  cellValues: Record<string, unknown>,
  schemaForTable: ReadonlyArray<AirtableFieldSchema> | undefined,
): {
  fields: Record<string, unknown>;
  parsedFields?: Record<string, ParsedFieldValue>;
  skippedFields?: Array<{ name: string; type: string }>;
} {
  if (!schemaForTable || schemaForTable.length === 0) {
    // No schema — forward raw cell values keyed by field id. Workflows
    // can still access via `{{trigger.fields.fldXXX}}`.
    return { fields: cellValues };
  }
  const { parsed, skipped } = parseFieldsWithSchema(cellValues, schemaForTable);
  return {
    fields: cellValues,
    parsedFields: parsed,
    skippedFields: skipped,
  };
}

function tableSectionEvents(
  ctx: NormalizeContext,
  tableId: string,
  section: WebhookPayloadTableSection,
  payloadTimestamp: string | undefined,
  baseTransactionNumber: number | undefined,
): TriggerEvent[] {
  const events: TriggerEvent[] = [];
  const schemaForTable = ctx.schemaByTableId?.[tableId];
  const occurredAt = payloadTimestamp ?? ctx.notificationOccurredAt;

  // 1. Created records.
  if (section.createdRecordsById) {
    for (const [recordId, record] of Object.entries(section.createdRecordsById)) {
      const cellValues = extractCellValues(record);
      const fieldsPayload = buildFieldsPayload(cellValues, schemaForTable);
      events.push({
        provider: "airtable",
        eventType: "record_changed",
        eventId: buildEventId(ctx, tableId, recordId, "created", baseTransactionNumber),
        occurredAt,
        accountId: ctx.accountId,
        payload: {
          eventType: "created",
          baseId: ctx.baseId,
          tableId,
          recordId,
          createdTime: record.createdTime ?? null,
          ...fieldsPayload,
          baseTransactionNumber: baseTransactionNumber ?? null,
        },
      });
    }
  }

  // 2. Changed records.
  if (section.changedRecordsById) {
    for (const [recordId, record] of Object.entries(section.changedRecordsById)) {
      const cellValues = extractCellValues(record);
      const fieldsPayload = buildFieldsPayload(cellValues, schemaForTable);
      events.push({
        provider: "airtable",
        eventType: "record_changed",
        eventId: buildEventId(ctx, tableId, recordId, "updated", baseTransactionNumber),
        occurredAt,
        accountId: ctx.accountId,
        payload: {
          eventType: "updated",
          baseId: ctx.baseId,
          tableId,
          recordId,
          ...fieldsPayload,
          changedFieldsById: record.changedFieldsById ?? null,
          previousValues: record.previous?.cellValuesByFieldId ?? null,
          baseTransactionNumber: baseTransactionNumber ?? null,
        },
      });
    }
  }

  // 3. Destroyed records.
  if (section.destroyedRecordIds) {
    for (const recordId of section.destroyedRecordIds) {
      events.push({
        provider: "airtable",
        eventType: "record_changed",
        eventId: buildEventId(ctx, tableId, recordId, "deleted", baseTransactionNumber),
        occurredAt,
        accountId: ctx.accountId,
        payload: {
          eventType: "deleted",
          baseId: ctx.baseId,
          tableId,
          recordId,
          fields: {},
          baseTransactionNumber: baseTransactionNumber ?? null,
          deleted: true,
        },
      });
    }
  }

  return events;
}

/**
 * Walk a single Airtable payload and emit TriggerEvents. Returns zero
 * events when the payload has no record-level changes (e.g.,
 * `actionMetadata`-only payloads from schema operations).
 */
export function normalizePayload(
  payload: WebhookPayload,
  ctx: NormalizeContext,
): NormalizedPayload {
  const events: TriggerEvent[] = [];
  const tables = payload.changedTablesById ?? {};
  for (const [tableId, section] of Object.entries(tables)) {
    events.push(
      ...tableSectionEvents(
        ctx,
        tableId,
        section,
        payload.timestamp,
        payload.baseTransactionNumber,
      ),
    );
  }
  return { events };
}

/**
 * Convenience: normalize a sequence of payloads into a flat event list.
 */
export function normalizePayloads(
  payloads: ReadonlyArray<WebhookPayload>,
  ctx: NormalizeContext,
): NormalizedPayload {
  const events: TriggerEvent[] = [];
  for (const p of payloads) {
    events.push(...normalizePayload(p, ctx).events);
  }
  return { events };
}
