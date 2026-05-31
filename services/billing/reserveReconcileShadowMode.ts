import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import {
  estimateWorkflowTaskCost,
  type CostWarning,
} from "./workflowCostEstimator";

/**
 * Reserve/Reconcile SHADOW-MODE comparison (Slice 4.COST-14).
 *
 * PURE + deterministic + NON-MUTATING. Given a finished run's definition +
 * actual billable usage + what flat billing charged, it computes what the
 * reserve/reconcile model WOULD have done — for side-by-side comparison logging
 * only. It is the safe wedge that lets us collect real flat-vs-proposed data
 * before any live billing change.
 *
 * It does NOT:
 *  - mutate any balance,
 *  - call any reserve/reconcile RPC (it imports only the pure estimator),
 *  - read or echo node config / secrets (the estimator never reads config, so
 *    the output is structurally ids/counts/enums/warnings only).
 *
 * The proposed model = reserve the estimator upper bound, reconcile actual
 * (clamped to the reserve), refund the remainder — mirroring the COST-11
 * design, computed here without touching the DB.
 */

export interface ShadowBillingSummary {
  tasksLimit: number;
  tasksUsed: number;
  tasksRemaining: number;
}

export interface ShadowComparisonInput {
  accountId: string;
  workflowId: string;
  workflowRunId: string;
  workflowDefinition: WorkflowDefinition;
  /** What flat billing actually charged this run (1 for a real run today). */
  flatChargedTasks: number;
  /** Post-run actuals (from the COST-3 recorder). */
  actualUsage: { actualTaskCost: number };
  /**
   * Pre-flat-charge balance so `wouldHaveHadEnoughBalance` reflects whether a
   * reservation could have been placed instead of the flat charge. Optional.
   */
  billingSummary?: ShadowBillingSummary | null;
}

export interface ReserveReconcileShadowComparison {
  billingMode: "shadow";
  status: "computed";
  workflowId: string;
  workflowRunId: string;
  flatChargedTasks: number;
  estimatedTasksPerRun: number;
  actualBillableTasks: number;
  proposedReservedTasks: number;
  proposedReconciledTasks: number;
  proposedRefundedTasks: number;
  /** proposedReconciledTasks − flatChargedTasks (positive ⇒ proposed charges more). */
  deltaVsFlat: number;
  wouldHaveReserved: boolean;
  /** null when no billing summary was supplied. */
  wouldHaveHadEnoughBalance: boolean | null;
  warnings: CostWarning[];
  policyVersion: string;
}

/**
 * Build the flat-vs-reserve/reconcile comparison for one finished run.
 * Pure: re-estimates from the definition (cheap) and folds in the actuals.
 */
export function buildReserveReconcileShadowComparison(
  input: ShadowComparisonInput,
): ReserveReconcileShadowComparison {
  const estimate = estimateWorkflowTaskCost(input.workflowDefinition);
  const estimatedTasksPerRun = Math.max(0, estimate.estimatedTasksPerRun);
  const actualBillableTasks = Math.max(0, input.actualUsage.actualTaskCost);

  const proposedReservedTasks = estimatedTasksPerRun;
  const proposedReconciledTasks = Math.min(actualBillableTasks, proposedReservedTasks);
  const proposedRefundedTasks = proposedReservedTasks - proposedReconciledTasks;
  const deltaVsFlat = proposedReconciledTasks - input.flatChargedTasks;
  const wouldHaveReserved = proposedReservedTasks > 0;
  const wouldHaveHadEnoughBalance = input.billingSummary
    ? estimatedTasksPerRun <= input.billingSummary.tasksRemaining
    : null;

  return {
    billingMode: "shadow",
    status: "computed",
    workflowId: input.workflowId,
    workflowRunId: input.workflowRunId,
    flatChargedTasks: input.flatChargedTasks,
    estimatedTasksPerRun,
    actualBillableTasks,
    proposedReservedTasks,
    proposedReconciledTasks,
    proposedRefundedTasks,
    deltaVsFlat,
    wouldHaveReserved,
    wouldHaveHadEnoughBalance,
    warnings: estimate.warnings,
    policyVersion: estimate.policyVersion,
  };
}

/**
 * Engine-side convenience: derive the pre-flat-charge balance summary from a
 * (already-deducted) billing-gate outcome, then build the comparison. Keeps the
 * gate→summary mapping out of the engine's hot path. `used`/`limit` come from
 * the flat gate's post-deduction state; we add back `flatChargedTasks` so the
 * summary reflects the balance a reservation would have seen instead.
 */
export function buildShadowFromRun(args: {
  accountId: string;
  workflowId: string;
  workflowRunId: string;
  workflowDefinition: WorkflowDefinition;
  flatChargedTasks: number;
  actualUsage: { actualTaskCost: number };
  /** The flat gate's post-deduction counters (absent ⇒ no summary). */
  gate: { used?: number; limit?: number };
}): ReserveReconcileShadowComparison {
  const { used, limit } = args.gate;
  const billingSummary =
    typeof used === "number" && typeof limit === "number"
      ? {
          tasksLimit: limit,
          tasksUsed: Math.max(0, used - args.flatChargedTasks),
          tasksRemaining: Math.max(0, limit - used + args.flatChargedTasks),
        }
      : null;
  return buildReserveReconcileShadowComparison({ ...args, billingSummary });
}

/**
 * Engine orchestration: build the comparison, log it, and persist it — all
 * FAIL-OPEN. `persist` + `log` are injected so this module imports only the
 * pure estimator (no repo / no reserve-reconcile RPC → a balance-mutating path
 * stays structurally unreachable). Never throws.
 */
export async function recordShadowComparison(args: {
  accountId: string;
  workflowId: string;
  workflowRunId: string;
  workflowDefinition: WorkflowDefinition;
  flatChargedTasks: number;
  actualUsage: { actualTaskCost: number };
  gate: { used?: number; limit?: number };
  persist: (comparison: ReserveReconcileShadowComparison, accountId: string) => Promise<void>;
  log: (event: string, extra?: Record<string, unknown>) => void;
}): Promise<void> {
  let comparison: ReserveReconcileShadowComparison;
  try {
    comparison = buildShadowFromRun(args);
  } catch (err) {
    args.log("execution.run.billing_shadow_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  args.log("execution.run.billing_shadow", { ...comparison });
  try {
    await args.persist(comparison, args.accountId);
  } catch (err) {
    args.log("execution.run.billing_shadow_persist_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
