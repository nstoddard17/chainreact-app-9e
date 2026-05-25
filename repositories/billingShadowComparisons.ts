import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for billing_shadow_comparisons (Slice 4.COST-14C) — the persisted
 * reserve/reconcile SHADOW ledger (hypothetical billing, separate from the
 * actual task_usage_events / ai_cost_events ledgers).
 *
 * All access goes through the service-role client: the engine writes these in
 * the background (no user session), and the consumers are owner/admin analytics
 * (cross-user). RLS still gates any future user-facing SSR read to own rows.
 *
 * NEVER persist node config / secrets / tokens / payloads / raw warning
 * messages — only ids, counts, booleans, warning CODES, policy version, and
 * timestamps. Callers (the recorder service) pass already-shaped scalar values.
 */

export interface BillingShadowComparisonInsert {
  userId: string;
  workflowId: string;
  workflowRunId: string;
  flatChargedTasks: number;
  estimatedTasksPerRun: number;
  actualBillableTasks: number;
  proposedReservedTasks: number;
  proposedReconciledTasks: number;
  proposedRefundedTasks: number;
  deltaVsFlat: number;
  wouldHaveReserved: boolean;
  wouldHaveHadEnoughBalance: boolean | null;
  warningCodes: string[];
  policyVersion: string;
}

export interface BillingShadowComparisonRecord extends BillingShadowComparisonInsert {
  id: string;
  billingMode: "shadow";
  createdAt: string;
}

interface BillingShadowComparisonRow {
  id: string;
  user_id: string;
  workflow_id: string;
  workflow_run_id: string;
  flat_charged_tasks: number;
  estimated_tasks_per_run: number;
  actual_billable_tasks: number;
  proposed_reserved_tasks: number;
  proposed_reconciled_tasks: number;
  proposed_refunded_tasks: number;
  delta_vs_flat: number;
  would_have_reserved: boolean;
  would_have_had_enough_balance: boolean | null;
  warning_codes: string[];
  policy_version: string;
  billing_mode: "shadow";
  created_at: string;
}

function toInsertRow(e: BillingShadowComparisonInsert): Record<string, unknown> {
  return {
    user_id: e.userId,
    workflow_id: e.workflowId,
    workflow_run_id: e.workflowRunId,
    flat_charged_tasks: e.flatChargedTasks,
    estimated_tasks_per_run: e.estimatedTasksPerRun,
    actual_billable_tasks: e.actualBillableTasks,
    proposed_reserved_tasks: e.proposedReservedTasks,
    proposed_reconciled_tasks: e.proposedReconciledTasks,
    proposed_refunded_tasks: e.proposedRefundedTasks,
    delta_vs_flat: e.deltaVsFlat,
    would_have_reserved: e.wouldHaveReserved,
    would_have_had_enough_balance: e.wouldHaveHadEnoughBalance,
    warning_codes: e.warningCodes,
    policy_version: e.policyVersion,
    billing_mode: "shadow",
  };
}

function rowToRecord(row: BillingShadowComparisonRow): BillingShadowComparisonRecord {
  return {
    id: row.id,
    userId: row.user_id,
    workflowId: row.workflow_id,
    workflowRunId: row.workflow_run_id,
    flatChargedTasks: row.flat_charged_tasks,
    estimatedTasksPerRun: row.estimated_tasks_per_run,
    actualBillableTasks: row.actual_billable_tasks,
    proposedReservedTasks: row.proposed_reserved_tasks,
    proposedReconciledTasks: row.proposed_reconciled_tasks,
    proposedRefundedTasks: row.proposed_refunded_tasks,
    deltaVsFlat: row.delta_vs_flat,
    wouldHaveReserved: row.would_have_reserved,
    wouldHaveHadEnoughBalance: row.would_have_had_enough_balance,
    warningCodes: row.warning_codes ?? [],
    policyVersion: row.policy_version,
    billingMode: row.billing_mode,
    createdAt: row.created_at,
  };
}

/**
 * Append one shadow comparison. IDEMPOTENT on workflow_run_id — a duplicate
 * insert (engine retry) is ignored, keeping the first comparison for the run.
 */
export async function insertComparison(
  comparison: BillingShadowComparisonInsert,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `engine: billing_shadow_comparisons insert (run ${comparison.workflowRunId})`,
  );
  const { error } = await supabase
    .from("billing_shadow_comparisons")
    .upsert(toInsertRow(comparison), {
      onConflict: "workflow_run_id",
      ignoreDuplicates: true,
    });
  if (error) {
    throw new Error(
      `billing_shadow_comparisons.insertComparison failed: ${error.message}`,
    );
  }
}

/** Filters for an owner/admin shadow analytics range read. */
export interface ShadowComparisonQuery {
  from?: string;
  to?: string;
  userId?: string;
  workflowId?: string;
  limit?: number;
}

/**
 * Owner/admin cross-user range read (service-role, bypasses RLS). For
 * server-side owner/admin shadow analytics only.
 */
export async function listForRange(
  q: ShadowComparisonQuery = {},
): Promise<readonly BillingShadowComparisonRecord[]> {
  const supabase = getServiceRoleClient(
    "analytics: billing_shadow_comparisons range read (owner/admin)",
  );
  let query = supabase.from("billing_shadow_comparisons").select("*");
  if (q.from) query = query.gte("created_at", q.from);
  if (q.to) query = query.lte("created_at", q.to);
  if (q.userId) query = query.eq("user_id", q.userId);
  if (q.workflowId) query = query.eq("workflow_id", q.workflowId);
  query = query.order("created_at", { ascending: false });
  if (q.limit !== undefined) query = query.limit(q.limit);
  const { data, error } = await query;
  if (error) {
    throw new Error(
      `billing_shadow_comparisons.listForRange failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) => rowToRecord(r as BillingShadowComparisonRow));
}

/** Owner/admin read of one workflow's shadow comparisons (service-role). */
export async function listForWorkflow(
  workflowId: string,
): Promise<readonly BillingShadowComparisonRecord[]> {
  return listForRange({ workflowId });
}
