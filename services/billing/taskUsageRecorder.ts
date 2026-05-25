import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { WorkflowRunStep } from "@/repositories/workflowRuns";
import { getActionMeta } from "@/services/discovery/_registry";
import * as taskUsageEventsRepo from "@/repositories/taskUsageEvents";
import {
  classifyNodeTaskCost,
  getTaskCostPolicyVersion,
  type ChargeOn,
  type TaskCostReason,
} from "./taskCostPolicy";
import { estimateWorkflowTaskCost } from "./workflowCostEstimator";

/**
 * Task usage recorder (Slice 4.COST-3, ledger-only first).
 *
 * `computeRunTaskUsage` is PURE — given a definition + the engine's step
 * results it derives the COST-2 estimate, the actual cost (sum of SUCCESSFUL
 * billable action nodes), and the per-node billable events. It never reads
 * node config, so secrets cannot leak into the output by construction.
 *
 * `recordRunActuals` writes those into the append-only `task_usage_events`
 * ledger. It does NOT deduct tasks — live billing remains the flat 1/run gate
 * (Slice 1N) + COST-2A test-mode skip. This is parallel auditability +
 * foundation for a future reserve/reconcile model.
 *
 * Test/dry-run runs are NOT recorded here at all — the engine passes
 * `usage = null` for test runs (no user-billable ledger rows). Documented
 * decision (audit §5): skip the ledger entirely in test mode.
 *
 * Charge policy (via COST-2 `taskCostPolicy`): only SUCCESSFUL billable
 * action nodes record a `node_task_charged` event. Failed nodes (handler
 * failure, missing variable, invalid branch), skipped nodes, triggers, and
 * non-billable control-flow nodes record nothing billable.
 */

export interface NodeTaskUsage {
  nodeId: string;
  provider: string;
  nodeType: string;
  nodeKind: "action" | "trigger";
  tasksCharged: number;
  chargeOn: ChargeOn;
  costReason: TaskCostReason;
}

export interface RunTaskUsage {
  /** COST-2 estimate (upper bound over all reachable billable nodes). */
  estimatedTaskCost: number;
  /** Actual: sum of successful billable action nodes this run. */
  actualTaskCost: number;
  policyVersion: string;
  /** Redacted numeric summary (counts only — no config). */
  estimateSummary: {
    billableNodeCount: number;
    nonBillableNodeCount: number;
    unknownNodeCount: number;
    warningCount: number;
  };
  /** One entry per successful billable action node. */
  nodeEvents: NodeTaskUsage[];
}

/**
 * Pure: derive the run's estimated + actual task cost and per-node billable
 * events from the definition + the engine's step results. No DB, no config
 * reads.
 */
export function computeRunTaskUsage(
  def: WorkflowDefinition,
  steps: readonly WorkflowRunStep[],
): RunTaskUsage {
  const estimate = estimateWorkflowTaskCost(def);
  const succeededIds = new Set(
    steps.filter((s) => s.status === "succeeded").map((s) => s.nodeId),
  );

  const nodeEvents: NodeTaskUsage[] = [];
  let actualTaskCost = 0;

  for (const node of def.nodes) {
    if (node.kind !== "action") continue; // triggers never bill
    if (!succeededIds.has(node.id)) continue; // only successful nodes count
    const meta = getActionMeta(`${node.provider}:${node.type}`);
    const cost = classifyNodeTaskCost(node, meta);
    if (!cost.billable) continue; // control-flow / unknown → no billable event
    actualTaskCost += cost.baseTasks;
    nodeEvents.push({
      nodeId: node.id,
      provider: node.provider,
      nodeType: node.type,
      nodeKind: node.kind,
      tasksCharged: cost.baseTasks,
      chargeOn: cost.chargeOn,
      costReason: cost.reason,
    });
  }

  return {
    estimatedTaskCost: estimate.estimatedTasksPerRun,
    actualTaskCost,
    policyVersion: getTaskCostPolicyVersion(),
    estimateSummary: {
      billableNodeCount: estimate.billableNodes.length,
      nonBillableNodeCount: estimate.nonBillableNodes.length,
      unknownNodeCount: estimate.unknownCostNodes.length,
      warningCount: estimate.warnings.length,
    },
    nodeEvents,
  };
}

export interface RecordRunActualsInput {
  runId: string;
  workflowId: string;
  userId: string;
  usage: RunTaskUsage;
}

/**
 * Write a real run's usage events to the ledger: one `run_estimate_recorded`
 * (estimate vs actual rollup) + one `node_task_charged` per billable node.
 * Throws on DB failure — the engine wraps this fail-open so a ledger write
 * never breaks execution.
 */
export async function recordRunActuals(
  input: RecordRunActualsInput,
): Promise<void> {
  const { runId, workflowId, userId, usage } = input;

  const events: taskUsageEventsRepo.TaskUsageEventInsert[] = [
    {
      userId,
      workflowId,
      workflowRunId: runId,
      eventType: "run_estimate_recorded",
      billable: false,
      tasksCharged: 0,
      estimatedTasks: usage.estimatedTaskCost,
      actualTasks: usage.actualTaskCost,
      costPolicyVersion: usage.policyVersion,
      testMode: false,
      // Redacted numeric summary only — never node config.
      metadata: { ...usage.estimateSummary },
    },
    ...usage.nodeEvents.map((n) => ({
      userId,
      workflowId,
      workflowRunId: runId,
      nodeId: n.nodeId,
      provider: n.provider,
      nodeType: n.nodeType,
      nodeKind: n.nodeKind,
      eventType: "node_task_charged" as const,
      billable: true,
      tasksCharged: n.tasksCharged,
      actualTasks: n.tasksCharged,
      chargeOn: n.chargeOn,
      costReason: n.costReason,
      costPolicyVersion: usage.policyVersion,
      testMode: false,
    })),
  ];

  await taskUsageEventsRepo.insertEvents(events);
}

/** Convenience read-through for run-scoped usage (analytics / tests). */
export async function listTaskUsageForRun(
  runId: string,
): Promise<readonly taskUsageEventsRepo.TaskUsageEventRecord[]> {
  return taskUsageEventsRepo.listByRun(runId);
}
