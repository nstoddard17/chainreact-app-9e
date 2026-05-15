import { airtableRequest, encodeTableSegment } from "./_request";

/**
 * Airtable Records API wrappers — Slice 10 Commit 3.
 *
 * Five endpoints:
 *   - `recordsList` — GET /v0/{baseId}/{tableIdOrName}
 *   - `recordsGet` — GET /v0/{baseId}/{tableIdOrName}/{recordId}
 *   - `recordsCreate` — POST /v0/{baseId}/{tableIdOrName}
 *   - `recordsUpdate` — PATCH /v0/{baseId}/{tableIdOrName}/{recordId}
 *   - `recordsDelete` — DELETE /v0/{baseId}/{tableIdOrName}/{recordId}
 *
 * Used by:
 *   - `actions/listRecords.ts` → `recordsList`
 *   - `actions/getRecord.ts` → `recordsGet`
 *   - `actions/findRecord.ts` → `recordsList` (with filterByFormula +
 *     maxRecords=1; takes the first match)
 *   - `actions/createRecord.ts` → `recordsCreate`
 *   - `actions/updateRecord.ts` → `recordsUpdate`
 *   - `actions/deleteRecord.ts` → `recordsDelete`
 *
 * All wrappers route through `airtableRequest` so 401 / 404 mapping
 * lives in one place.
 *
 * Note on PATCH vs PUT — Airtable distinguishes the two:
 *   - PATCH only updates the fields the user passed; others preserved.
 *   - PUT clears any field not explicitly set.
 * V2 only exposes PATCH (the V1 default + the safer behavior). The
 * full-replace PUT pattern is deferred — workflow authors who need it
 * can pre-fetch + patch with the union, or wait for a follow-up
 * action.
 */

// ─── Shared shapes ─────────────────────────────────────────────────────────

/**
 * Single Airtable record. `fields` is keyed by field name (or id, if
 * the caller used `returnFieldsByFieldId=true` on the list/get call —
 * Slice 10 Batch 1 doesn't expose that flag, so all reads use names).
 */
export interface AirtableRecord {
  id: string;
  /** Raw field values keyed by field name. Type-aware parsing is
   * caller-side via `_shared/airtable/fields.ts` `parseFieldsWithSchema`. */
  fields: Record<string, unknown>;
  /** ISO-8601 created timestamp. */
  createdTime?: string;
}

// ─── recordsList ───────────────────────────────────────────────────────────

export interface RecordsListInput {
  accessToken: string;
  baseId: string;
  tableIdOrName: string;
  /**
   * Airtable formula passed verbatim. V2 trusts the user's formula —
   * V1's keywordSearch / dateFilter convenience builders are dropped
   * per Slice 10 plan §"V1 patterns to skip".
   */
  filterByFormula?: string;
  /** Airtable's hard ceiling is 100 — schema layer enforces this. */
  pageSize?: number;
  maxRecords?: number;
  /** Pagination cursor returned by the previous page's `offset`. */
  offset?: string;
  /** Subset of field names to return; omit to return all fields. */
  fields?: ReadonlyArray<string>;
  /** View name or id to scope results to a specific Airtable view. */
  view?: string;
  /** Sort entries forwarded verbatim — `[{ field, direction }]`. */
  sort?: ReadonlyArray<{ field: string; direction?: "asc" | "desc" }>;
}

export interface RecordsListResponse {
  records: AirtableRecord[];
  /** Present when there's a next page; undefined on the last page. */
  offset?: string;
}

export async function recordsList(
  input: RecordsListInput,
): Promise<RecordsListResponse> {
  const params = new URLSearchParams();
  if (input.filterByFormula !== undefined) {
    params.append("filterByFormula", input.filterByFormula);
  }
  if (input.pageSize !== undefined) {
    params.append("pageSize", String(input.pageSize));
  }
  if (input.maxRecords !== undefined) {
    params.append("maxRecords", String(input.maxRecords));
  }
  if (input.offset !== undefined) {
    params.append("offset", input.offset);
  }
  if (input.view !== undefined) {
    params.append("view", input.view);
  }
  if (input.fields !== undefined) {
    // Airtable expects each field name as a separate `fields[]=...`
    // query param.
    for (const f of input.fields) {
      params.append("fields[]", f);
    }
  }
  if (input.sort !== undefined) {
    input.sort.forEach((entry, i) => {
      params.append(`sort[${i}][field]`, entry.field);
      if (entry.direction !== undefined) {
        params.append(`sort[${i}][direction]`, entry.direction);
      }
    });
  }

  return airtableRequest<RecordsListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/v0/${input.baseId}/${encodeTableSegment(input.tableIdOrName)}`,
    query: params,
    resourceForNotFound: `table ${input.baseId}/${input.tableIdOrName}`,
  });
}

// ─── recordsGet ────────────────────────────────────────────────────────────

export interface RecordsGetInput {
  accessToken: string;
  baseId: string;
  tableIdOrName: string;
  recordId: string;
}

export async function recordsGet(
  input: RecordsGetInput,
): Promise<AirtableRecord> {
  return airtableRequest<AirtableRecord>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/v0/${input.baseId}/${encodeTableSegment(input.tableIdOrName)}/${encodeURIComponent(input.recordId)}`,
    resourceForNotFound: `record ${input.recordId}`,
  });
}

// ─── recordsCreate ─────────────────────────────────────────────────────────

export interface RecordsCreateInput {
  accessToken: string;
  baseId: string;
  tableIdOrName: string;
  /** Wire-format field values — already coerced via `formatFields`. */
  fields: Readonly<Record<string, unknown>>;
  /**
   * Q11 — explicit, no hidden default. Airtable's `typecast: true`
   * tells the server to coerce strings to enum values (etc.) on
   * write. Slice 10 makes the choice explicit at the schema layer;
   * defaults to `false` (safe — no silent server-side coercion).
   */
  typecast: boolean;
}

export async function recordsCreate(
  input: RecordsCreateInput,
): Promise<AirtableRecord> {
  return airtableRequest<AirtableRecord>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/v0/${input.baseId}/${encodeTableSegment(input.tableIdOrName)}`,
    body: { fields: input.fields, typecast: input.typecast },
    resourceForNotFound: `table ${input.baseId}/${input.tableIdOrName}`,
  });
}

// ─── recordsBatchCreate (Airtable 2.1 Commit 3) ────────────────────────────

export interface RecordsBatchCreateInput {
  accessToken: string;
  baseId: string;
  tableIdOrName: string;
  /**
   * 1..10 records. Each entry's `fields` is wire-format — already
   * coerced via `formatFields`. Airtable enforces the max-10 server-side
   * (returns 422 with "INVALID_REQUEST_UNKNOWN" or
   * "INVALID_RECORDS"); the action schema enforces it client-side too
   * so workflow authors fail loud at parse time.
   */
  records: ReadonlyArray<{ fields: Readonly<Record<string, unknown>> }>;
  /** Same semantics as `recordsCreate.typecast` — Q11 explicit. */
  typecast: boolean;
}

export interface RecordsBatchCreateResponse {
  records: AirtableRecord[];
}

/**
 * Airtable batch create — POST `/v0/{baseId}/{tableIdOrName}` with
 * `body.records = [{fields}]`. All-or-nothing: Airtable returns 422
 * if ANY record fails validation; no partial-success semantics. The
 * `airtableRequest` helper surfaces 422 as a tagged error which the
 * caller's `refreshAndRetry` lets propagate.
 *
 * V1 had a `createMultipleRecords.ts` action that did a sequential
 * single-record loop (per parity-airtable §8 A-R11). V2 uses the real
 * batch wire-format — exactly ONE HTTP request per call.
 */
export async function recordsBatchCreate(
  input: RecordsBatchCreateInput,
): Promise<RecordsBatchCreateResponse> {
  return airtableRequest<RecordsBatchCreateResponse>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/v0/${input.baseId}/${encodeTableSegment(input.tableIdOrName)}`,
    body: {
      records: input.records.map((r) => ({ fields: r.fields })),
      typecast: input.typecast,
    },
    resourceForNotFound: `table ${input.baseId}/${input.tableIdOrName}`,
  });
}

// ─── recordsUpdate ─────────────────────────────────────────────────────────

export interface RecordsUpdateInput {
  accessToken: string;
  baseId: string;
  tableIdOrName: string;
  recordId: string;
  fields: Readonly<Record<string, unknown>>;
  typecast: boolean;
}

export async function recordsUpdate(
  input: RecordsUpdateInput,
): Promise<AirtableRecord> {
  return airtableRequest<AirtableRecord>({
    accessToken: input.accessToken,
    method: "PATCH",
    path: `/v0/${input.baseId}/${encodeTableSegment(input.tableIdOrName)}/${encodeURIComponent(input.recordId)}`,
    body: { fields: input.fields, typecast: input.typecast },
    resourceForNotFound: `record ${input.recordId}`,
  });
}

// ─── recordsDelete ─────────────────────────────────────────────────────────

export interface RecordsDeleteInput {
  accessToken: string;
  baseId: string;
  tableIdOrName: string;
  recordId: string;
}

export interface RecordsDeleteResponse {
  id: string;
  deleted: true;
}

export async function recordsDelete(
  input: RecordsDeleteInput,
): Promise<RecordsDeleteResponse> {
  return airtableRequest<RecordsDeleteResponse>({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/v0/${input.baseId}/${encodeTableSegment(input.tableIdOrName)}/${encodeURIComponent(input.recordId)}`,
    resourceForNotFound: `record ${input.recordId}`,
  });
}
