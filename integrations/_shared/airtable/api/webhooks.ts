import { airtableRequest } from "@/integrations/airtable/api/_request";

/**
 * Airtable Webhooks API wrappers — Slice 10 Commit 4.
 *
 * Four endpoints (per current Airtable webhooks docs cross-checked
 * against V1's `lib/integrations/airtable/webhooks.ts:475-643` and
 * `lib/triggers/providers/AirtableTriggerLifecycle.ts:127-180`):
 *   - `webhooksCreate` — POST /v0/bases/{baseId}/webhooks
 *     Returns `{ id, macSecretBase64, expirationTime, notificationUrl }`.
 *   - `webhooksDelete` — DELETE /v0/bases/{baseId}/webhooks/{webhookId}
 *     Returns `{}` on success; 404 on already-deleted.
 *   - `webhooksRefresh` — POST /v0/bases/{baseId}/webhooks/{webhookId}/refresh
 *     Returns `{ expirationTime }`. Extends the 7-day TTL by another 7d.
 *   - `webhooksListPayloads` — GET
 *     /v0/bases/{baseId}/webhooks/{webhookId}/payloads?cursor=N
 *     Returns `{ payloads, cursor, mightHaveMore }`. Cursor is an
 *     opaque integer pagination index; omit on first call (Airtable
 *     defaults to 0). Persist response.cursor as the next call's
 *     starting cursor.
 *
 * All wrappers route through `airtableRequest` so 401/404/error
 * mapping matches every other Airtable wrapper in V2.
 *
 * Lives in `_shared/airtable/api/` (not `airtable/api/`) so the
 * cross-module record_changed trigger import path matches V2's
 * shared-helper convention. Future Airtable triggers (e.g. a
 * collaborator_changed trigger) reuse this same module.
 */

// ─── Wire-format types ──────────────────────────────────────────────────────

/**
 * Notification url targets one workflow's webhook receive route. The
 * `?workflowId=...` querystring is V1's convention for steering the
 * receive path; V2's lookup goes via `webhookId` instead, but we keep
 * the querystring for diagnostic logs (Airtable echoes
 * `notificationUrl` in webhook GET / list responses).
 */
export interface WebhookSpecification {
  /**
   * Optional table-level filter. When present, the webhook only fires
   * for changes inside the named table id; when absent, watches all
   * tables in the base.
   */
  recordChangeScope?: string;
  /**
   * Always `["tableData"]` for record_changed; the other Airtable
   * webhook data types (schema changes, view metadata) are deferred.
   */
  dataTypes: ReadonlyArray<"tableData">;
}

export interface WebhooksCreateInput {
  accessToken: string;
  baseId: string;
  notificationUrl: string;
  /**
   * Optional spec. When omitted, V2 defaults to
   * `{ dataTypes: ["tableData"] }` (watch all tables for record-data
   * changes). Provide `recordChangeScope` to scope to one table.
   */
  specification?: WebhookSpecification;
}

export interface WebhooksCreateResponse {
  id: string;
  /** Base64-encoded HMAC key. Persist for signature verification on inbound. */
  macSecretBase64: string;
  /** ISO-8601 expiration; 7-day TTL from creation per Airtable docs. */
  expirationTime: string;
  notificationUrl?: string;
  /** Echoed back; useful for diagnostic asserts. */
  specification?: { options?: { filters?: WebhookSpecification } };
}

export async function webhooksCreate(
  input: WebhooksCreateInput,
): Promise<WebhooksCreateResponse> {
  const filters: WebhookSpecification = input.specification ?? {
    dataTypes: ["tableData"],
  };
  return airtableRequest<WebhooksCreateResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/v0/bases/${encodeURIComponent(input.baseId)}/webhooks`,
    body: {
      notificationUrl: input.notificationUrl,
      specification: { options: { filters } },
    },
    resourceForNotFound: `base ${input.baseId}`,
  });
}

// ─── webhooksDelete ────────────────────────────────────────────────────────

export interface WebhooksDeleteInput {
  accessToken: string;
  baseId: string;
  webhookId: string;
}

export async function webhooksDelete(
  input: WebhooksDeleteInput,
): Promise<Record<string, unknown>> {
  return airtableRequest<Record<string, unknown>>({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/v0/bases/${encodeURIComponent(input.baseId)}/webhooks/${encodeURIComponent(input.webhookId)}`,
    resourceForNotFound: `webhook ${input.webhookId}`,
  });
}

// ─── webhooksRefresh ───────────────────────────────────────────────────────

export interface WebhooksRefreshInput {
  accessToken: string;
  baseId: string;
  webhookId: string;
}

export interface WebhooksRefreshResponse {
  expirationTime: string;
}

export async function webhooksRefresh(
  input: WebhooksRefreshInput,
): Promise<WebhooksRefreshResponse> {
  return airtableRequest<WebhooksRefreshResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/v0/bases/${encodeURIComponent(input.baseId)}/webhooks/${encodeURIComponent(input.webhookId)}/refresh`,
    // Empty JSON body — Airtable's refresh endpoint accepts no
    // params; sending {} keeps the request shape Content-Type
    // application/json (airtableRequest sets the header when body
    // is defined).
    body: {},
    resourceForNotFound: `webhook ${input.webhookId}`,
  });
}

// ─── webhooksListPayloads ──────────────────────────────────────────────────

/**
 * Single payload entry in a webhook's payload feed. Shape per current
 * Airtable docs:
 *   - `timestamp`: ISO-8601 of the change.
 *   - `baseTransactionNumber`: per-base sequential int — used as
 *     part of the V2 dedup key so successive edits to the same record
 *     in different transactions each fire as distinct events.
 *   - `actionMetadata`: `{ source, sourceMetadata }` — opaque to V2.
 *   - `changedTablesById`: keyed by table id; each value carries
 *     `createdRecordsById?`, `changedRecordsById?`, and/or
 *     `destroyedRecordIds?`.
 *
 * Slice 10 keeps the shape OPAQUE — `normalize.ts` walks the buckets
 * and produces one TriggerEvent per record per event type.
 */
export interface WebhookPayloadRecord {
  /** Created record body. */
  createdTime?: string;
  cellValuesByFieldId?: Record<string, unknown>;
  /** Updated record body. */
  current?: { cellValuesByFieldId?: Record<string, unknown> };
  previous?: { cellValuesByFieldId?: Record<string, unknown> };
  unchanged?: { cellValuesByFieldId?: Record<string, unknown> };
  /** Echoed from Airtable. */
  changedFieldsById?: Record<string, unknown>;
}

export interface WebhookPayloadTableSection {
  createdRecordsById?: Record<string, WebhookPayloadRecord>;
  changedRecordsById?: Record<string, WebhookPayloadRecord>;
  destroyedRecordIds?: ReadonlyArray<string>;
}

export interface WebhookPayload {
  timestamp?: string;
  baseTransactionNumber?: number;
  payloadFormat?: string;
  actionMetadata?: Record<string, unknown>;
  changedTablesById?: Record<string, WebhookPayloadTableSection>;
}

export interface WebhooksListPayloadsInput {
  accessToken: string;
  baseId: string;
  webhookId: string;
  /**
   * Opaque pagination cursor. Omit on first call — Airtable defaults
   * to 0 (the start of the payload feed). Persist `response.cursor`
   * as the next call's starting cursor.
   */
  cursor?: number;
  /** Optional max results; defaults to Airtable's server-side cap. */
  limit?: number;
}

export interface WebhooksListPayloadsResponse {
  payloads: WebhookPayload[];
  /** Next call's starting cursor. ALWAYS present on success. */
  cursor: number;
  /** True when more payloads remain past this cursor. */
  mightHaveMore: boolean;
}

export async function webhooksListPayloads(
  input: WebhooksListPayloadsInput,
): Promise<WebhooksListPayloadsResponse> {
  const params = new URLSearchParams();
  if (input.cursor !== undefined) {
    params.append("cursor", String(input.cursor));
  }
  if (input.limit !== undefined) {
    params.append("limit", String(input.limit));
  }
  return airtableRequest<WebhooksListPayloadsResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/v0/bases/${encodeURIComponent(input.baseId)}/webhooks/${encodeURIComponent(input.webhookId)}/payloads`,
    query: params,
    resourceForNotFound: `webhook ${input.webhookId}`,
  });
}
