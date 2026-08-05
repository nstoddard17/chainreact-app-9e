import { getServiceRoleClient } from "../supabase/serviceRoleClient";
import { requireFiniteNumber } from "@/core/database/columnNarrowing";
import type { RpcArgs, RpcRows } from "@/types/rpc";

/**
 * Repository for the flexible analytics query path
 * (Slice ANALYTICS-FLEXIBILITY-CS-1) — the ONLY caller of the
 * `analytics_runs_aggregate` RPC (migration 20260801000000).
 *
 * Lives under `repositories/analytics/` — the analytics domain split created
 * when the flat `repositories/` folder reached the 50-file leaf cap
 * (docs/rules/project-structure-and-module-boundaries.md). Future analytics
 * repositories (and eventually the existing dashboard/snapshot repos) belong
 * here too.
 *
 * NON-AUTHORIZING (service-role): the RPC's EXECUTE grant is service_role-only
 * and `authenticated` holds no SELECT on workflow_runs, so this layer is
 * unreachable except through server code. Every caller MUST pass an account id
 * it has ALREADY membership-resolved from the caller's own session
 * (`requireAccount` → `resolveActiveAccount`); the service additionally
 * validates any workflow ids against that account BEFORE they reach this call.
 * The hard `p_account_id` predicate inside the RPC is defense in depth, not the
 * user-facing authorization.
 *
 * Returns BASE aggregates only — measure math lives in
 * services/analytics/metricDefinitions.ts. No payload columns are ever
 * selected by the RPC; nothing here can widen that.
 *
 * TABLE TYPING (SUPABASE-TABLE-TYPING-1C): this repository performs NO table
 * access — it is a single `.rpc()` call, which by the 1A design stays on the
 * untyped client and is guarded on both sides by `RpcArgs` / `RpcRows` +
 * `scripts/ci/rpc-signature-guard.mjs`. It is therefore deliberately ABSENT
 * from `scripts/ci/typed-db-manifest.json`, whose contract is that every listed
 * file routes `.from()` through `asTypedDb`.
 *
 * Two things the generated RPC type cannot say, handled explicitly below:
 *   - `RETURNS TABLE` columns are all typed non-null, but `bucket_start` and
 *     `group_key` are genuinely NULL for KPI (dimension-less) rows — the row
 *     type here is the honest one.
 *   - the count/sum columns are `bigint`/`numeric`, which PostgREST may return
 *     as a JSON string; they are parsed fail-closed rather than `Number()`-ed
 *     into a silent `NaN`.
 */

export interface AnalyticsAggregateParams {
  accountId: string;
  /** ISO timestamps; the window is [from, to). */
  from: string;
  to: string;
  /** null = KPI (one total row). */
  dimension: "time" | "workflow" | "status" | "trigger_source" | null;
  /** Required when dimension = "time". */
  grain: "day" | "week" | "month" | null;
  /** Only with dimension = "time"; "workflow" requires workflowIds. */
  seriesBy: "workflow" | "status" | null;
  workflowIds: readonly string[] | null;
  statuses: readonly ("succeeded" | "failed")[] | null;
  triggerSources: readonly string[] | null;
  includeTests: boolean;
  /** Categorical dimensions only. Pass the desired cap + 1 to detect truncation. */
  limit: number | null;
}

export interface AnalyticsAggregateRow {
  /** UTC bucket start (ISO) for the time dimension; null otherwise. */
  bucketStart: string | null;
  /** workflow id / status / trigger source; null for KPI + plain time rows. */
  groupKey: string | null;
  runs: number;
  succeeded: number;
  failed: number;
  durSumMs: number;
  durCount: number;
}

export async function aggregateRuns(
  params: AnalyticsAggregateParams,
): Promise<readonly AnalyticsAggregateRow[]> {
  const supabase = getServiceRoleClient(
    `analytics: aggregateRuns account ${params.accountId}`,
  );
  const { data, error } = await supabase.rpc("analytics_runs_aggregate", {
    p_account_id: params.accountId,
    p_from: params.from,
    p_to: params.to,
    p_dimension: params.dimension,
    p_grain: params.grain,
    p_series_by: params.seriesBy,
    p_workflow_ids: params.workflowIds ? [...params.workflowIds] : null,
    p_statuses: params.statuses ? [...params.statuses] : null,
    p_trigger_sources: params.triggerSources ? [...params.triggerSources] : null,
    p_include_tests: params.includeTests,
    p_limit: params.limit,
  } satisfies RpcArgs<"analytics_runs_aggregate">);
  if (error) {
    throw new Error(`analytics_runs_aggregate failed: ${error.message}`);
  }
  const rows: RpcRows<"analytics_runs_aggregate"> = data ?? [];
  return rows.map((r) => ({
    // Non-null in the generated RETURNS TABLE type, genuinely null for KPI rows.
    bucketStart: r.bucket_start ?? null,
    groupKey: r.group_key ?? null,
    runs: requireFiniteNumber("analytics_runs_aggregate.runs", r.runs),
    succeeded: requireFiniteNumber("analytics_runs_aggregate.succeeded", r.succeeded),
    failed: requireFiniteNumber("analytics_runs_aggregate.failed", r.failed),
    durSumMs: requireFiniteNumber("analytics_runs_aggregate.dur_sum_ms", r.dur_sum_ms),
    durCount: requireFiniteNumber("analytics_runs_aggregate.dur_count", r.dur_count),
  }));
}
