import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";

/**
 * repositories/reactAgent/metrics.ts (INTERNAL-FEEDBACK-2).
 *
 * Cross-account AGGREGATION for the internal React Agent metrics dashboard. This
 * is the ONLY place that reads React Agent telemetry across every account, so it
 * uses the service-role client (RLS bypass) — an internal admin is not a member
 * of customer accounts, so a cookie-client read would return nothing. The route
 * that reaches this is gated by `requireInternalAdmin` upstream; the service-role
 * usage is confined here per docs/rules/database-security.md.
 *
 * NO-LEAK GUARANTEE (structural, not just a filter): this repository never SELECTs
 * a content column. Every count uses `head: true` (returns a COUNT, transfers zero
 * rows). The single row-returning query selects ONLY `setup_issue_count` (an int)
 * and `workflow_id` (an id used solely to compute a distinct COUNT here and never
 * returned). `prompt`, `summary`, `title`, `failure_reason`, `diff`, `metadata`,
 * `account_id`, `created_by_user_id` are never read. So no prompt/secret/PII can
 * reach a caller even by accident.
 */

const REASON = "internal: react-agent metrics aggregation (cross-account, counts only)";
const CHANGES = "agent_change_history";
const GOVERNANCE = "react_agent_audit_events";

export interface ReactAgentMetricsFilter {
  /** Inclusive ISO lower bound on created_at, or null/undefined for no bound. */
  from?: string | null;
  /** Inclusive ISO upper bound on created_at, or null/undefined for no bound. */
  to?: string | null;
}

export interface ReactAgentMetricsAggregate {
  totalAgentChanges: number;
  preview: {
    created: number;
    applied: number;
    keptAsPreview: number;
    discarded: number;
    applyFailed: number;
    undone: number;
  };
  test: { tested: number; testFailed: number };
  setupIssues: {
    changesWithIssues: number;
    totalIssues: number;
    workflowsNeedingSetup: number;
  };
  governance: { total: number; success: number; denied: number; failed: number };
}

type ServiceRoleClient = ReturnType<typeof getServiceRoleClient>;

/** Count rows in `table` (optionally `status`/`outcome`-scoped) within the range.
 *  head:true → the DB returns a COUNT and NO rows (zero content transferred). */
async function countRows(
  sb: ServiceRoleClient,
  table: string,
  filter: ReactAgentMetricsFilter,
  scope?: { column: string; value: string },
): Promise<number> {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (filter.from) q = q.gte("created_at", filter.from);
  if (filter.to) q = q.lte("created_at", filter.to);
  if (scope) q = q.eq(scope.column, scope.value);
  const { count, error } = await q;
  if (error) throw new Error("reactAgentMetrics: aggregation query failed");
  return count ?? 0;
}

/** Setup-issue rollup. Selects ONLY the int + id needed; returns aggregate ints. */
async function setupIssueRollup(
  sb: ServiceRoleClient,
  filter: ReactAgentMetricsFilter,
): Promise<{ changesWithIssues: number; totalIssues: number; workflowsNeedingSetup: number }> {
  let q = sb.from(CHANGES).select("setup_issue_count, workflow_id").gt("setup_issue_count", 0);
  if (filter.from) q = q.gte("created_at", filter.from);
  if (filter.to) q = q.lte("created_at", filter.to);
  const { data, error } = await q;
  if (error) throw new Error("reactAgentMetrics: setup-issue rollup failed");
  const rows = (data ?? []) as ReadonlyArray<{ setup_issue_count: number; workflow_id: string }>;
  const workflows = new Set<string>();
  let totalIssues = 0;
  for (const r of rows) {
    totalIssues += typeof r.setup_issue_count === "number" ? r.setup_issue_count : 0;
    if (r.workflow_id) workflows.add(r.workflow_id);
  }
  return {
    changesWithIssues: rows.length,
    totalIssues,
    workflowsNeedingSetup: workflows.size,
  };
}

/**
 * Aggregate all approved metrics in one pass. Every read is count-only except the
 * setup rollup (int + id only). Runs the independent counts concurrently.
 */
export async function aggregateReactAgentMetrics(
  filter: ReactAgentMetricsFilter = {},
): Promise<ReactAgentMetricsAggregate> {
  const sb = getServiceRoleClient(REASON);
  const st = (value: string) => ({ column: "status", value });
  const oc = (value: string) => ({ column: "outcome", value });

  const [
    totalAgentChanges,
    created,
    applied,
    keptAsPreview,
    discarded,
    applyFailed,
    undone,
    tested,
    testFailed,
    setupIssues,
    govTotal,
    govSuccess,
    govDenied,
    govFailed,
  ] = await Promise.all([
    countRows(sb, CHANGES, filter),
    countRows(sb, CHANGES, filter, st("preview_created")),
    countRows(sb, CHANGES, filter, st("preview_applied")),
    countRows(sb, CHANGES, filter, st("kept_as_preview")),
    countRows(sb, CHANGES, filter, st("preview_discarded")),
    countRows(sb, CHANGES, filter, st("apply_failed")),
    countRows(sb, CHANGES, filter, st("undone")),
    countRows(sb, CHANGES, filter, st("tested")),
    countRows(sb, CHANGES, filter, st("test_failed")),
    setupIssueRollup(sb, filter),
    countRows(sb, GOVERNANCE, filter),
    countRows(sb, GOVERNANCE, filter, oc("success")),
    countRows(sb, GOVERNANCE, filter, oc("denied")),
    countRows(sb, GOVERNANCE, filter, oc("failed")),
  ]);

  return {
    totalAgentChanges,
    preview: { created, applied, keptAsPreview, discarded, applyFailed, undone },
    test: { tested, testFailed },
    setupIssues,
    governance: { total: govTotal, success: govSuccess, denied: govDenied, failed: govFailed },
  };
}
