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
 * `created` / `updated` / `deleted` / `table_deleted` / `unknown`.
 * Workflows branch on the discriminator; the dedup key includes it so
 * successive change-classes against the same record fire as distinct
 * events.
 *
 * Walks each payload's `changedTablesById`:
 *   - `createdRecordsById` → `eventType: "created"`, fields parsed
 *     from `cellValuesByFieldId` (or top-level `cellValuesByFieldId`
 *     for some Airtable response shapes).
 *   - `changedRecordsById` → `eventType: "updated"`, fields parsed
 *     from `current.cellValuesByFieldId`.
 *   - `destroyedRecordIds` → `eventType: "deleted"`, fields = {} .
 *
 * Then walks the payload's root-level `destroyedTableIds` (Airtable 2.1
 * Commit 5):
 *   - one event per destroyed table → `eventType: "table_deleted"`,
 *     payload carries `tableId` + `destroyedTableIds` (the full list
 *     destroyed in this same payload, for fan-out diagnostics). No
 *     recordId, no fields. Per V1's `airtable_trigger_table_deleted`
 *     semantic — folded into the consolidated trigger so workflows
 *     branch on `eventType` instead of a separate trigger type.
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
  | "table_deleted"
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

/**
 * Build the table_deleted dedup key. The subject is the destroyed
 * tableId itself (no recordId applies). Slot the literal `_table_`
 * into the recordId segment so the 5-segment shape stays consistent
 * with record-level events; uniqueness is provided by tableId + txn.
 */
function buildTableDeletedEventId(
  ctx: NormalizeContext,
  tableId: string,
  baseTransactionNumber: number | undefined,
): string {
  const txDiscriminator =
    baseTransactionNumber !== undefined
      ? String(baseTransactionNumber)
      : ctx.notificationOccurredAt;
  return `${ctx.webhookId}:${tableId}:_table_:table_deleted:${txDiscriminator}`;
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
        providerAccountId: ctx.accountId,
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
        providerAccountId: ctx.accountId,
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
        providerAccountId: ctx.accountId,
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
 * Emit one `table_deleted` event per destroyed tableId in the payload's
 * root-level `destroyedTableIds`. Per Airtable's webhook spec the field
 * lives at the payload root (NOT inside `changedTablesById`, since the
 * table no longer exists). Airtable 2.1 Commit 5.
 */
function tableDeletedEvents(
  ctx: NormalizeContext,
  destroyedTableIds: ReadonlyArray<string>,
  payloadTimestamp: string | undefined,
  baseTransactionNumber: number | undefined,
): TriggerEvent[] {
  const occurredAt = payloadTimestamp ?? ctx.notificationOccurredAt;
  const snapshot = [...destroyedTableIds];
  return destroyedTableIds.map((tableId) => ({
    provider: "airtable",
    eventType: "record_changed",
    eventId: buildTableDeletedEventId(ctx, tableId, baseTransactionNumber),
    occurredAt,
    providerAccountId: ctx.accountId,
    payload: {
      eventType: "table_deleted",
      baseId: ctx.baseId,
      tableId,
      destroyedTableIds: snapshot,
      baseTransactionNumber: baseTransactionNumber ?? null,
    },
  }));
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
  if (payload.destroyedTableIds && payload.destroyedTableIds.length > 0) {
    events.push(
      ...tableDeletedEvents(
        ctx,
        payload.destroyedTableIds,
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
