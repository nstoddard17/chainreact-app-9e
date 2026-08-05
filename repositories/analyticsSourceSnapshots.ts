import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
import { toJsonColumn } from "@/core/database/jsonColumn";
import type { TableColumns, TableInsert } from "@/types/tables";

/**
 * Repository for `analytics_source_snapshots` (Slice ANALYTICS-SOURCES-CACHE-1).
 *
 * SERVICE-ROLE only. Reads + writes are NON-AUTHORIZING at this layer — safety
 * comes from the `cache_key`, which deterministically encodes `account_id` +
 * `source_user_id` (+ provider/metric/range/filters). The cache layer computes
 * that key from the caller's RESOLVED context, so a `getByCacheKey` can only ever
 * return the snapshot for that exact (account, user, query) tuple — a co-member
 * computes a different key. The table's RLS (member-scoped, personal rows
 * owner-only) is the defense-in-depth for any direct authenticated access.
 *
 * The `result` column holds a NormalizedAnalyticsResult only; this repo treats it
 * as opaque JSON — the cache service validates it with Zod on read + write.
 *
 * TABLE TYPING (SUPABASE-TABLE-TYPING-1C). Table access runs through
 * `asTypedDb`. The snapshot payload is classified OPAQUE CACHED EVIDENCE and
 * stays `Json` here, for a concrete reason rather than convenience: TWO
 * different contracts share this column, distinguished only by the cache-key
 * namespace — `NormalizedAnalyticsResultSchema` for the widget sources
 * (`services/analytics/sources/cache.ts`) and `ConnectedAnalyticsResultSchema`
 * for connected datasets (`services/analytics/insights/cache.ts`). The
 * repository cannot know which applies, so validating here would mean either a
 * third permissive schema that proves nothing, or rejecting a payload that is
 * perfectly valid for the other consumer. Both consumers already parse
 * fail-closed and treat an unparseable blob as a CACHE MISS (recompute), which
 * is the established product rule — no caller ever trusts this value unvalidated.
 *
 * Writes CONSTRUCT the `Json` with `toJsonColumn` instead of asserting
 * `as Json`, so a non-encodable result is rejected before it is persisted.
 *
 * The row projection below is a genuine PARTIAL select (`created_at` /
 * `updated_at` are not read), so it is a `TableColumns<>` pick — not a
 * `TableRow`, which would claim columns this query never asked for.
 */

export interface AnalyticsSnapshotRecord {
  id: string;
  accountId: string;
  sourceUserId: string | null;
  providerKey: string;
  metricKey: string;
  rangeKey: string;
  groupBy: string | null;
  filtersHash: string;
  cacheKey: string;
  result: unknown;
  generatedAt: string;
  expiresAt: string;
}

type SnapshotRow = TableColumns<
  "analytics_source_snapshots",
  | "id"
  | "account_id"
  | "source_user_id"
  | "provider_key"
  | "metric_key"
  | "range_key"
  | "group_by"
  | "filters_hash"
  | "cache_key"
  | "result"
  | "generated_at"
  | "expires_at"
>;

const COLUMNS =
  "id,account_id,source_user_id,provider_key,metric_key,range_key,group_by,filters_hash,cache_key,result,generated_at,expires_at";

function rowToRecord(row: SnapshotRow): AnalyticsSnapshotRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    sourceUserId: row.source_user_id,
    providerKey: row.provider_key,
    metricKey: row.metric_key,
    rangeKey: row.range_key,
    groupBy: row.group_by,
    filtersHash: row.filters_hash,
    cacheKey: row.cache_key,
    result: row.result,
    generatedAt: row.generated_at,
    expiresAt: row.expires_at,
  };
}

/** Load a snapshot by its deterministic cache key (service-role). */
export async function getByCacheKey(
  cacheKey: string,
): Promise<AnalyticsSnapshotRecord | null> {
  const supabase = asTypedDb(
    getServiceRoleClient(`analytics_source_snapshots: getByCacheKey`),
  );
  const { data, error } = await supabase
    .from("analytics_source_snapshots")
    .select(COLUMNS)
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (error) {
    throw new Error(`analytics_source_snapshots.getByCacheKey failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

export interface UpsertSnapshotInput {
  accountId: string;
  sourceUserId: string | null;
  providerKey: string;
  metricKey: string;
  rangeKey: string;
  groupBy: string | null;
  filtersHash: string;
  cacheKey: string;
  result: unknown;
  generatedAt: string;
  expiresAt: string;
}

/** Upsert a snapshot in place, keyed on `cache_key` (service-role). */
export async function upsertServiceRole(input: UpsertSnapshotInput): Promise<void> {
  const supabase = asTypedDb(
    getServiceRoleClient(
      `analytics_source_snapshots: upsert ${input.providerKey}/${input.metricKey}`,
    ),
  );
  const row = {
    account_id: input.accountId,
    source_user_id: input.sourceUserId,
    provider_key: input.providerKey,
    metric_key: input.metricKey,
    range_key: input.rangeKey,
    group_by: input.groupBy,
    filters_hash: input.filtersHash,
    cache_key: input.cacheKey,
    result: toJsonColumn("analytics_source_snapshots.result", input.result),
    generated_at: input.generatedAt,
    expires_at: input.expiresAt,
  } satisfies TableInsert<"analytics_source_snapshots">;
  const { error } = await supabase
    .from("analytics_source_snapshots")
    .upsert(row, { onConflict: "cache_key" });
  if (error) {
    throw new Error(`analytics_source_snapshots.upsertServiceRole failed: ${error.message}`);
  }
}

/** Delete expired snapshots (service-role). For a future cleanup cron. */
export async function deleteExpiredServiceRole(nowIso: string): Promise<number> {
  const supabase = asTypedDb(
    getServiceRoleClient(`analytics_source_snapshots: deleteExpired`),
  );
  const { data, error } = await supabase
    .from("analytics_source_snapshots")
    .delete()
    .lt("expires_at", nowIso)
    .select("id");
  if (error) {
    throw new Error(`analytics_source_snapshots.deleteExpiredServiceRole failed: ${error.message}`);
  }
  return data?.length ?? 0;
}
