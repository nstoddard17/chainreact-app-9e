import * as billingShadowComparisonsRepo from "@/repositories/billingShadowComparisons";
import type { BillingShadowComparisonRecord } from "@/repositories/billingShadowComparisons";
import type { ReserveReconcileShadowComparison } from "./reserveReconcileShadowMode";
import type { CostWarningCode } from "./workflowCostEstimator";
import {
  summarizeShadowComparisons,
  groupShadowByWorkflow,
  getShadowDeltaStats,
  getShadowInsufficientBalanceStats,
  type ShadowSummary,
  type ShadowDeltaStats,
  type ShadowInsufficientBalanceStats,
  type ShadowWorkflowStat,
} from "@/services/analytics/reserveReconcileShadowStats";

/**
 * Persisted reserve/reconcile SHADOW comparison service (Slice 4.COST-14C).
 *
 * `recordBillingShadowComparison` is the engine's fail-open writer (one row per
 * real run when shadow mode is on). The `get*Stats` functions load persisted
 * rows (owner/admin, service-role) and fold them through the COST-14B PURE
 * aggregator — giving a durable, queryable source for the COST-15 cutover
 * decision instead of stdout logs.
 *
 * Hypothetical billing ONLY — never touches a balance, never writes
 * task_usage_events, never calls a reserve/reconcile RPC. Persists only
 * ids/counts/booleans/warning codes/policy version (no config/secrets).
 */

/** Map a comparison (+ the owner) into the persisted insert shape. */
export async function recordBillingShadowComparison(
  comparison: ReserveReconcileShadowComparison,
  userId: string,
): Promise<void> {
  await billingShadowComparisonsRepo.insertComparison({
    userId,
    workflowId: comparison.workflowId,
    workflowRunId: comparison.workflowRunId,
    flatChargedTasks: comparison.flatChargedTasks,
    estimatedTasksPerRun: comparison.estimatedTasksPerRun,
    actualBillableTasks: comparison.actualBillableTasks,
    proposedReservedTasks: comparison.proposedReservedTasks,
    proposedReconciledTasks: comparison.proposedReconciledTasks,
    proposedRefundedTasks: comparison.proposedRefundedTasks,
    deltaVsFlat: comparison.deltaVsFlat,
    wouldHaveReserved: comparison.wouldHaveReserved,
    wouldHaveHadEnoughBalance: comparison.wouldHaveHadEnoughBalance,
    // CODES only — never warning messages.
    warningCodes: comparison.warnings.map((w) => w.code),
    policyVersion: comparison.policyVersion,
  });
}

/** Reconstruct a comparison-shaped object from a persisted row (codes → warnings). */
function rowToComparison(
  r: BillingShadowComparisonRecord,
): ReserveReconcileShadowComparison {
  return {
    billingMode: "shadow",
    status: "computed",
    workflowId: r.workflowId,
    workflowRunId: r.workflowRunId,
    flatChargedTasks: r.flatChargedTasks,
    estimatedTasksPerRun: r.estimatedTasksPerRun,
    actualBillableTasks: r.actualBillableTasks,
    proposedReservedTasks: r.proposedReservedTasks,
    proposedReconciledTasks: r.proposedReconciledTasks,
    proposedRefundedTasks: r.proposedRefundedTasks,
    deltaVsFlat: r.deltaVsFlat,
    wouldHaveReserved: r.wouldHaveReserved,
    wouldHaveHadEnoughBalance: r.wouldHaveHadEnoughBalance,
    warnings: r.warningCodes.map((code) => ({
      code: code as CostWarningCode,
      message: "",
    })),
    policyVersion: r.policyVersion,
  };
}

export interface PersistedShadowStats {
  summary: ShadowSummary;
  delta: ShadowDeltaStats;
  insufficientBalance: ShadowInsufficientBalanceStats;
}

/** Owner/admin: load persisted shadow rows in a range and aggregate them. */
export async function getReserveReconcileShadowStats(
  range: { from?: string; to?: string; limit?: number } = {},
): Promise<PersistedShadowStats> {
  const rows = await billingShadowComparisonsRepo.listForRange(range);
  const comparisons = rows.map(rowToComparison);
  return {
    summary: summarizeShadowComparisons(comparisons),
    delta: getShadowDeltaStats(comparisons),
    insufficientBalance: getShadowInsufficientBalanceStats(comparisons),
  };
}

/** Owner/admin: per-workflow shadow aggregation over a range. */
export async function getReserveReconcileShadowStatsByWorkflow(
  args: { from?: string; to?: string; limit?: number } = {},
): Promise<Record<string, ShadowWorkflowStat>> {
  const rows = await billingShadowComparisonsRepo.listForRange(args);
  return groupShadowByWorkflow(rows.map(rowToComparison));
}
