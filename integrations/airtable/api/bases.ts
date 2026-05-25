import { airtableRequest } from "./_request";

/**
 * Airtable Bases API wrappers — Slice 10 Commit 3.
 *
 * One endpoint:
 *   - `basesGetSchema` — GET /v0/meta/bases/{baseId}/tables
 *
 * Used by:
 *   - `actions/getBaseSchema.ts` → returns the full table list.
 *   - `actions/getTableSchema.ts` → fetches the same response and
 *     filters to a single table client-side (Airtable doesn't expose
 *     a per-table metadata endpoint).
 *
 * The endpoint requires `schema.bases:read` scope (declared in the
 * manifest).
 */

/**
 * Single field metadata entry as returned by Airtable's table-schema
 * endpoint. The `options` shape varies per type — opaque to V2; the
 * field-polymorphism layer in `_shared/airtable/fields.ts` consumes
 * `id` / `name` / `type` and ignores options.
 */
export interface AirtableFieldMetadata {
  id: string;
  name: string;
  type: string;
  description?: string;
  options?: Record<string, unknown>;
}

export interface AirtableViewMetadata {
  id: string;
  name: string;
  type: string;
}

export interface AirtableTableMetadata {
  id: string;
  name: string;
  primaryFieldId: string;
  description?: string;
  fields: AirtableFieldMetadata[];
  /** Present only when the request asked for views. */
  views?: AirtableViewMetadata[];
}

export interface BasesGetSchemaResponse {
  tables: AirtableTableMetadata[];
}

export interface BasesGetSchemaInput {
  accessToken: string;
  baseId: string;
  /**
   * Q11 — explicit, no hidden default. When `true`, Airtable's
   * response includes `views[]` for each table. V1's `getBaseSchema`
   * defaults this to `false`; V2 forces the schema layer to require
   * an explicit value (default false at the action layer because the
   * extra payload is rarely useful and fetching all views can be
   * heavy on large bases).
   */
  includeViews: boolean;
}

export async function basesGetSchema(
  input: BasesGetSchemaInput,
): Promise<BasesGetSchemaResponse> {
  // Airtable's `include` query param is repeatable; the only
  // documented value is `visibleFieldIds` which Slice 10 doesn't use.
  // For views, the way to request them is to NOT filter the response —
  // Airtable returns views only when the `include[]=fields` (and a
  // separate `?include` for views) is set. Per current docs the
  // `views` array is included when `include=visibleFieldIds` AND the
  // request is to the table endpoint, OR included by default for the
  // `meta/bases/{baseId}/tables` endpoint when the integration has
  // `schema.bases:read` scope. V2's manifest has the scope; the
  // response always carries `views[]` server-side. The
  // `includeViews` action-layer flag controls whether V2's output
  // SHAPES include views (drop them at the wrapper output if false)
  // — matching V1's `getBaseSchema.ts:64-69` filter behavior.
  const response = await airtableRequest<BasesGetSchemaResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/v0/meta/bases/${encodeURIComponent(input.baseId)}/tables`,
    resourceForNotFound: `base ${input.baseId}`,
  });
  if (!input.includeViews) {
    return {
      tables: response.tables.map(({ views: _ignored, ...rest }) => rest),
    };
  }
  return response;
}
