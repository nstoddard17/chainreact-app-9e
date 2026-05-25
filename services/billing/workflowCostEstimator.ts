import type {
  ActionCategory,
  ActionMeta,
  RiskLevel,
} from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeKind,
} from "@/contracts/workflowDefinition";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import {
  classifyNodeTaskCost,
  getTaskCostPolicyVersion,
  type ChargeOn,
  type TaskCostReason,
} from "./taskCostPolicy";

/**
 * Deterministic workflow cost estimator (Slice 4.COST-2, Part B).
 *
 * Given a `WorkflowDefinition`, returns an estimate of tasks-per-run grounded
 * in (1) the graph nodes/edges, (2) ActionMeta/TriggerMeta from the discovery
 * registry, and (3) the central `taskCostPolicy`. It is the single estimator
 * that AI WorkflowPatch validation/preview, workflow preview, template
 * estimation, and tier checks will all call — the AI must NEVER guess cost.
 *
 * Hard guarantees (Part C):
 *   - Read-only + side-effect free: no external provider calls, no AI models,
 *     no token reads, no DB writes, no billing deduction, no workflow mutation.
 *   - No secret leakage: the output is built ONLY from node identity
 *     (id/provider/type/kind), registry metadata (displayName/category/
 *     riskLevel), and policy classification. `node.config` is NEVER read or
 *     copied, so credentials/secrets in config cannot appear in the estimate.
 *
 * `estimatedTasksPerRun` is the sum of every billable node's base cost — an
 * upper bound that assumes all reachable nodes run. Branch-aware min/max
 * (router / if_then_condition only follow one path per run) is a documented
 * follow-up; when labeled (branching) edges are present the estimate carries
 * a `BRANCHING_UPPER_BOUND` warning so consumers know actual cost may be lower.
 */

export type CostWarningCode =
  | "EVENT_VOLUME_UNKNOWN" // event-driven trigger → runs-per-period not predictable
  | "SCHEDULE_ESTIMATE_UNAVAILABLE" // scheduled trigger; monthly derivation deferred (no cron-frequency parser yet)
  | "UNKNOWN_NODE_TYPE" // node not grounded in the registry → cost unknown
  | "BRANCHING_UPPER_BOUND"; // graph has branches; per-run cost may be lower than the sum

export interface CostWarning {
  code: CostWarningCode;
  message: string;
  /** The node the warning is about, when node-scoped. */
  nodeId?: string;
}

export interface NodeCostBreakdown {
  nodeId: string;
  provider: string;
  type: string;
  /** Registry displayName when known (never derived from config). */
  displayName?: string;
  kind: WorkflowNodeKind;
  billable: boolean;
  estimatedTasks: number;
  reason: TaskCostReason;
  chargeOn: ChargeOn;
  /** From ActionMeta when the node is a registered action. */
  riskLevel?: RiskLevel;
  /** From ActionMeta/TriggerMeta when known. */
  category?: ActionCategory;
}

export interface WorkflowCostEstimate {
  estimatedTasksPerRun: number;
  billableNodes: NodeCostBreakdown[];
  nonBillableNodes: NodeCostBreakdown[];
  /** Nodes the policy could not classify (unknown/ungrounded type). */
  unknownCostNodes: NodeCostBreakdown[];
  warnings: CostWarning[];
  policyVersion: string;
  /** Every node, in definition order. */
  nodeBreakdown: NodeCostBreakdown[];
}

/** Compact summary for token-cheap surfaces (AI context, preview chips). */
export interface WorkflowCostSummary {
  estimatedTasksPerRun: number;
  billableCount: number;
  nonBillableCount: number;
  unknownCount: number;
  warnings: CostWarning[];
  policyVersion: string;
}

function resolveMeta(node: WorkflowNode): ActionMeta | TriggerMeta | undefined {
  const key = `${node.provider}:${node.type}`;
  return node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
}

/**
 * Estimate one node's cost, grounded in its registry meta + the central
 * policy. Pure with respect to the in-memory, frozen discovery registry.
 */
export function estimateNodeTaskCost(node: WorkflowNode): NodeCostBreakdown {
  const meta = resolveMeta(node);
  const cost = classifyNodeTaskCost(node, meta);

  // riskLevel exists only on ActionMeta; category exists on both. Read
  // defensively so a trigger meta (no riskLevel) is handled cleanly.
  const riskLevel =
    meta && "riskLevel" in meta ? (meta.riskLevel as RiskLevel) : undefined;
  const category = meta?.category;

  return {
    nodeId: node.id,
    provider: node.provider,
    type: node.type,
    displayName: meta?.displayName,
    kind: node.kind,
    billable: cost.billable,
    estimatedTasks: cost.baseTasks,
    reason: cost.reason,
    chargeOn: cost.chargeOn,
    riskLevel,
    category,
  };
}

/**
 * Estimate the per-run task cost of a whole workflow definition.
 *
 * Deterministic: same definition → identical estimate every call.
 */
export function estimateWorkflowTaskCost(
  def: WorkflowDefinition,
): WorkflowCostEstimate {
  const nodeBreakdown: NodeCostBreakdown[] = def.nodes.map(estimateNodeTaskCost);

  const billableNodes: NodeCostBreakdown[] = [];
  const nonBillableNodes: NodeCostBreakdown[] = [];
  const unknownCostNodes: NodeCostBreakdown[] = [];
  const warnings: CostWarning[] = [];

  for (const b of nodeBreakdown) {
    if (b.reason === "unknown_node") {
      unknownCostNodes.push(b);
      warnings.push({
        code: "UNKNOWN_NODE_TYPE",
        message: `Node '${b.nodeId}' (${b.provider}:${b.type || "<no type>"}) is not a recognized action/trigger; its task cost is unknown and excluded from the estimate.`,
        nodeId: b.nodeId,
      });
    } else if (b.billable) {
      billableNodes.push(b);
    } else {
      nonBillableNodes.push(b);
    }
  }

  const estimatedTasksPerRun = billableNodes.reduce(
    (sum, b) => sum + b.estimatedTasks,
    0,
  );

  // Trigger-cadence warnings: the per-run estimate is exact, but how often a
  // run happens depends on the trigger. We never guess run frequency.
  const triggerNode = def.nodes.find((n) => n.kind === "trigger");
  if (triggerNode) {
    const meta = resolveMeta(triggerNode) as TriggerMeta | undefined;
    if (meta) {
      if (meta.activation === "scheduled") {
        warnings.push({
          code: "SCHEDULE_ESTIMATE_UNAVAILABLE",
          message:
            "Scheduled trigger: per-run cost is known, but a monthly estimate requires cron-frequency parsing (deferred follow-up).",
          nodeId: triggerNode.id,
        });
      } else if (meta.activation === "webhook" || meta.activation === "polling") {
        warnings.push({
          code: "EVENT_VOLUME_UNKNOWN",
          message:
            "Event-driven trigger: total task usage depends on how many events fire, which can't be predicted from the definition.",
          nodeId: triggerNode.id,
        });
      }
      // `manual` triggers fire on explicit user action — no volume warning.
    }
  }

  // Branching upper-bound: router / if_then_condition only follow one path per
  // run, so the summed estimate over-counts when branches exist.
  if (def.edges.some((e) => e.label !== undefined)) {
    warnings.push({
      code: "BRANCHING_UPPER_BOUND",
      message:
        "Workflow has branches; actual per-run cost may be lower than this upper-bound estimate (only one branch path runs per execution).",
    });
  }

  return {
    estimatedTasksPerRun,
    billableNodes,
    nonBillableNodes,
    unknownCostNodes,
    warnings,
    policyVersion: getTaskCostPolicyVersion(),
    nodeBreakdown,
  };
}

/** Token-cheap summary built from the full estimate. */
export function summarizeWorkflowCost(
  def: WorkflowDefinition,
): WorkflowCostSummary {
  const estimate = estimateWorkflowTaskCost(def);
  return {
    estimatedTasksPerRun: estimate.estimatedTasksPerRun,
    billableCount: estimate.billableNodes.length,
    nonBillableCount: estimate.nonBillableNodes.length,
    unknownCount: estimate.unknownCostNodes.length,
    warnings: estimate.warnings,
    policyVersion: estimate.policyVersion,
  };
}
