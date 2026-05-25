import type { ReserveReconcileShadowComparison } from "@/services/billing/reserveReconcileShadowMode";

/**
 * Reserve/Reconcile SHADOW-MODE metrics aggregation (Slice 4.COST-14B) — PURE.
 *
 * Folds an array of COST-14 shadow comparisons into summary stats so the
 * cutover decision (enable live reserve/reconcile for internal users, COST-15)
 * is made from AGGREGATE data, not raw logs. No DB, no I/O.
 *
 * INGESTION (documented, not built here): COST-14 shadow data is emitted as
 * `execution.run.billing_shadow` STRUCTURED LOGS only — console/stdout, not
 * persisted or in-app queryable (audited COST-14B). To use this aggregator in
 * production today: export those log lines, JSON-parse each payload into a
 * `ReserveReconcileShadowComparison`, and fold them here (offline / one-off
 * analysis). A persisted `billing_shadow_comparisons` table is the FUTURE
 * option (COST-14C) IF routine/in-app aggregation is needed — deliberately not
 * added now (avoids overbuild; keeps `task_usage_events` strictly actual
 * billing, never hypothetical).
 *
 * REDACTION: comparisons carry only ids / counts / enums / warning CODES — the
 * estimator never reads node config, so no secrets reach a comparison. This
 * aggregator further reads ONLY warning `code` (never `message`), so even a
 * tainted message can't leak into an aggregate.
 */

type Comparison = ReserveReconcileShadowComparison;

export interface ShadowSummary {
  total: number;
  flatTotalCharged: number;
  proposedTotalCharged: number;
  totalDelta: number;
  averageDelta: number;
  higherThanFlatCount: number;
  lowerThanFlatCount: number;
  sameAsFlatCount: number;
  totalEstimatedTasks: number;
  totalActualBillableTasks: number;
  /** estimated − actual (positive ⇒ over-estimation / refunds expected). */
  estimateVsActualVariance: number;
  proposedRefundsTotal: number;
  insufficientBalanceCount: number;
  byWarningCode: Record<string, number>;
  byPolicyVersion: Record<string, number>;
}

export interface ShadowWorkflowStat {
  count: number;
  flatTotal: number;
  proposedTotal: number;
  totalDelta: number;
  insufficientBalanceCount: number;
}

export interface RankedShadowDelta {
  workflowId: string;
  totalDelta: number;
  count: number;
}

export interface ShadowDeltaStats {
  totalDelta: number;
  averageDelta: number;
  higherThanFlatCount: number;
  lowerThanFlatCount: number;
  sameAsFlatCount: number;
  topPositiveDeltaWorkflows: RankedShadowDelta[];
  topNegativeDeltaWorkflows: RankedShadowDelta[];
}

export interface RankedInsufficientWorkflow {
  workflowId: string;
  insufficientBalanceCount: number;
  count: number;
}

export interface ShadowInsufficientBalanceStats {
  insufficientBalanceCount: number;
  workflowsWithInsufficientBalance: RankedInsufficientWorkflow[];
}

function bump(rec: Record<string, number>, key: string | null | undefined): void {
  if (!key) return;
  rec[key] = (rec[key] ?? 0) + 1;
}

/** Top-level roll-up over a set of shadow comparisons. */
export function summarizeShadowComparisons(
  comparisons: readonly Comparison[],
): ShadowSummary {
  const s: ShadowSummary = {
    total: comparisons.length,
    flatTotalCharged: 0,
    proposedTotalCharged: 0,
    totalDelta: 0,
    averageDelta: 0,
    higherThanFlatCount: 0,
    lowerThanFlatCount: 0,
    sameAsFlatCount: 0,
    totalEstimatedTasks: 0,
    totalActualBillableTasks: 0,
    estimateVsActualVariance: 0,
    proposedRefundsTotal: 0,
    insufficientBalanceCount: 0,
    byWarningCode: {},
    byPolicyVersion: {},
  };
  for (const c of comparisons) {
    s.flatTotalCharged += c.flatChargedTasks;
    s.proposedTotalCharged += c.proposedReconciledTasks;
    s.totalDelta += c.deltaVsFlat;
    if (c.deltaVsFlat > 0) s.higherThanFlatCount += 1;
    else if (c.deltaVsFlat < 0) s.lowerThanFlatCount += 1;
    else s.sameAsFlatCount += 1;
    s.totalEstimatedTasks += c.estimatedTasksPerRun;
    s.totalActualBillableTasks += c.actualBillableTasks;
    s.proposedRefundsTotal += c.proposedRefundedTasks;
    if (c.wouldHaveHadEnoughBalance === false) s.insufficientBalanceCount += 1;
    for (const w of c.warnings) bump(s.byWarningCode, w.code);
    bump(s.byPolicyVersion, c.policyVersion);
  }
  s.averageDelta = s.total === 0 ? 0 : s.totalDelta / s.total;
  s.estimateVsActualVariance =
    s.totalEstimatedTasks - s.totalActualBillableTasks;
  return s;
}

/** Group comparisons by workflow id. */
export function groupShadowByWorkflow(
  comparisons: readonly Comparison[],
): Record<string, ShadowWorkflowStat> {
  const out: Record<string, ShadowWorkflowStat> = {};
  for (const c of comparisons) {
    const stat = (out[c.workflowId] ??= {
      count: 0,
      flatTotal: 0,
      proposedTotal: 0,
      totalDelta: 0,
      insufficientBalanceCount: 0,
    });
    stat.count += 1;
    stat.flatTotal += c.flatChargedTasks;
    stat.proposedTotal += c.proposedReconciledTasks;
    stat.totalDelta += c.deltaVsFlat;
    if (c.wouldHaveHadEnoughBalance === false) stat.insufficientBalanceCount += 1;
  }
  return out;
}

/** Delta distribution + the workflows moving cost most in each direction. */
export function getShadowDeltaStats(
  comparisons: readonly Comparison[],
  limit = 10,
): ShadowDeltaStats {
  const summary = summarizeShadowComparisons(comparisons);
  const byWf = groupShadowByWorkflow(comparisons);
  const ranked = Object.entries(byWf).map(([workflowId, st]) => ({
    workflowId,
    totalDelta: st.totalDelta,
    count: st.count,
  }));
  const topPositiveDeltaWorkflows = ranked
    .filter((r) => r.totalDelta > 0)
    .sort((a, b) => b.totalDelta - a.totalDelta || a.workflowId.localeCompare(b.workflowId))
    .slice(0, limit);
  const topNegativeDeltaWorkflows = ranked
    .filter((r) => r.totalDelta < 0)
    .sort((a, b) => a.totalDelta - b.totalDelta || a.workflowId.localeCompare(b.workflowId))
    .slice(0, limit);
  return {
    totalDelta: summary.totalDelta,
    averageDelta: summary.averageDelta,
    higherThanFlatCount: summary.higherThanFlatCount,
    lowerThanFlatCount: summary.lowerThanFlatCount,
    sameAsFlatCount: summary.sameAsFlatCount,
    topPositiveDeltaWorkflows,
    topNegativeDeltaWorkflows,
  };
}

/** Insufficient-balance signal: total + the workflows recurringly affected. */
export function getShadowInsufficientBalanceStats(
  comparisons: readonly Comparison[],
  limit = 10,
): ShadowInsufficientBalanceStats {
  const byWf = groupShadowByWorkflow(comparisons);
  const workflowsWithInsufficientBalance = Object.entries(byWf)
    .filter(([, st]) => st.insufficientBalanceCount > 0)
    .map(([workflowId, st]) => ({
      workflowId,
      insufficientBalanceCount: st.insufficientBalanceCount,
      count: st.count,
    }))
    .sort(
      (a, b) =>
        b.insufficientBalanceCount - a.insufficientBalanceCount ||
        a.workflowId.localeCompare(b.workflowId),
    )
    .slice(0, limit);
  const insufficientBalanceCount = comparisons.reduce(
    (n, c) => n + (c.wouldHaveHadEnoughBalance === false ? 1 : 0),
    0,
  );
  return { insufficientBalanceCount, workflowsWithInsufficientBalance };
}
