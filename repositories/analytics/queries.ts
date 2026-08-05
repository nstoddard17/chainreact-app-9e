import { getServiceRoleClient } from "../supabase/serviceRoleClient";
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

interface RpcRow {
  bucket_start: string | null;
  group_key: string | null;
  runs: number;
  succeeded: number;
  failed: number;
  dur_sum_ms: number;
  dur_count: number;
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
    bucketStart: r.bucket_start,
    groupKey: r.group_key,
    runs: Number(r.runs),
    succeeded: Number(r.succeeded),
    failed: Number(r.failed),
    durSumMs: Number(r.dur_sum_ms),
    durCount: Number(r.dur_count),
  }));
}
