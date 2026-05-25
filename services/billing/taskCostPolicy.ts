import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

/**
 * Central, deterministic task-cost policy (Slice 4.COST-2, Part A).
 *
 * This is the SINGLE source of truth for "what does a workflow node cost?"
 * It is a pure function of `(node, meta?)` — no DB, no network, no AI, no
 * registry I/O — so it can be reused unchanged by the workflow cost
 * estimator (Part B), future AI WorkflowPatch validation/preview, template
 * estimation, billing/tier checks, and execution actual-cost recording.
 *
 * IMPORTANT — this slice does NOT change billing enforcement. Real
 * execution still deducts a flat 1 task/run (Slice 1N), with test/dry-run
 * runs skipped (Slice 4.COST-2A). This policy is read-only classification
 * that nothing in the billing gate consumes yet. The per-node /
 * reserve-reconcile model + task_usage_events ledger are future COST-3.
 * See docs/slices/phase-4/task-cost-billing-model-audit.md §5, §10, §11.
 *
 * Grounding: native node types are a closed, in-repo set
 * (integrations/native/actions/*), so they are classified directly from
 * `node.type`. Provider actions are classified as billable ONLY when the
 * caller supplies the registered `meta` (proof the `provider:type` exists
 * in the discovery registry) — an unrecognized provider node is classified
 * `unknown_node`, never silently billed. This mirrors the audit's "the
 * model is structurally unable to invent a node" grounding rule.
 *
 * Defaults-first: every node is classified from central defaults. There is
 * NO per-provider metadata edit required. An optional `taskCost` override
 * slot on ActionMeta/TriggerMeta is a deliberate future hook (COST-4); the
 * `source: "override" | "future_metadata_override"` values are reserved for
 * it but unused in this slice.
 */

/** Bump when the cost rules below change, so historical runs stay attributable. */
export const TASK_COST_POLICY_VERSION = "v1";

export function getTaskCostPolicyVersion(): string {
  return TASK_COST_POLICY_VERSION;
}

/**
 * When a charge is (conceptually) incurred. This slice only ever classifies
 * workflow nodes, which resolve to `success` (billable action) or `none`
 * (triggers, control-flow, unknown). The remaining values are reserved:
 *   - `attempt` — future: charge per attempt rather than per success.
 *   - `event` / `poll` — future: trigger/poll-level accounting.
 *   - `ai_call` — reserved for AI cost events, which are a SEPARATE ledger
 *     (not workflow tasks). `classifyNodeTaskCost` never returns `ai_call`,
 *     because AI operations are not WorkflowNodes.
 */
export type ChargeOn =
  | "success"
  | "attempt"
  | "event"
  | "poll"
  | "ai_call"
  | "none";

/** Why a node was classified the way it was — a stable enum for tests/UI. */
export type TaskCostReason =
  | "provider_action" // registered provider action → billable on success
  | "native_external_egress" // native:http_request → real external call
  | "native_control_flow" // if_then_condition / router / delay / format_transformer
  | "trigger" // any trigger node — listening/firing is not billed
  | "unknown_node"; // type not grounded in the registry / unknown native type

/** Where the cost decision came from. Only `default_policy` is used today. */
export type TaskCostSource =
  | "default_policy"
  | "override" // reserved — explicit programmatic override (unused)
  | "future_metadata_override"; // reserved — ActionMeta/TriggerMeta.taskCost (COST-4)

export interface NodeTaskCost {
  /** True iff this node consumes workflow task budget when it runs. */
  billable: boolean;
  /** Base tasks charged for one execution of this node. 0 for non-billable. */
  baseTasks: number;
  /**
   * Per-item task cost for bulk/loop nodes. Undefined today — V2 has no
   * bulk/loop node. Reserved so the estimator + future engine can express
   * `base + perItem × itemCount` without a policy contract change.
   */
  perItemTasks?: number;
  chargeOn: ChargeOn;
  reason: TaskCostReason;
  policyVersion: string;
  source: TaskCostSource;
}

const NATIVE_PROVIDER = "native";

/** Native action types that perform no external work → never billed. */
const NATIVE_ZERO_COST_ACTION_TYPES: ReadonlySet<string> = new Set([
  "if_then_condition",
  "router",
  "delay",
  "format_transformer",
]);

/**
 * Central cost-override map (Slice 4.COST-4).
 *
 * The SINGLE place a specific node's cost deviates from the category defaults
 * — keyed by the stable `provider:type` node key. This is how future
 * non-default nodes (bulk/loop with `perItemTasks`, file-heavy ops, premium
 * provider actions, high-cost native utilities, AI nodes if they ever become
 * WorkflowNodes) get their cost WITHOUT editing every provider metadata file.
 *
 * Today it holds exactly one entry: `native:http_request`. It is the one
 * native node that performs real external egress, so it overrides the native
 * default (0, in-process) to billable-1. Everything else flows through the
 * category defaults in `classifyNodeTaskCost`. Adding a node here is the
 * documented, reviewable way to introduce a non-default cost; NO product cost
 * numbers beyond the accepted defaults are seeded.
 *
 * Triggers are never looked up here — `classifyNodeTaskCost` short-circuits
 * `kind === "trigger"` to 0 before the override check, so an override can
 * never make a trigger billable.
 */
export interface TaskCostOverride {
  billable: boolean;
  baseTasks: number;
  /** Per-item cost for future bulk/loop nodes. Represented, not yet applied. */
  perItemTasks?: number;
  chargeOn: ChargeOn;
  reason: TaskCostReason;
}

const TASK_COST_OVERRIDES: ReadonlyMap<string, TaskCostOverride> = new Map([
  [
    "native:http_request",
    {
      billable: true,
      baseTasks: 1,
      chargeOn: "success",
      reason: "native_external_egress",
    } satisfies TaskCostOverride,
  ],
]);

/**
 * Look up an explicit cost override for a node. Returns `undefined` when the
 * node uses the category default. Triggers never have an override (they are
 * always free).
 */
export function getTaskCostOverride(
  provider: string,
  type: string,
  kind: "trigger" | "action",
): TaskCostOverride | undefined {
  if (kind === "trigger") return undefined;
  return TASK_COST_OVERRIDES.get(`${provider}:${type}`);
}

function nonBillable(reason: TaskCostReason): NodeTaskCost {
  return {
    billable: false,
    baseTasks: 0,
    chargeOn: "none",
    reason,
    policyVersion: TASK_COST_POLICY_VERSION,
    source: "default_policy",
  };
}

function billableOnSuccess(reason: TaskCostReason): NodeTaskCost {
  return {
    billable: true,
    baseTasks: 1,
    chargeOn: "success",
    reason,
    policyVersion: TASK_COST_POLICY_VERSION,
    source: "default_policy",
  };
}

function fromOverride(o: TaskCostOverride): NodeTaskCost {
  return {
    billable: o.billable,
    baseTasks: o.baseTasks,
    ...(o.perItemTasks !== undefined ? { perItemTasks: o.perItemTasks } : {}),
    chargeOn: o.chargeOn,
    reason: o.reason,
    policyVersion: TASK_COST_POLICY_VERSION,
    source: "override",
  };
}

/**
 * Classify one node's task cost.
 *
 * @param node The workflow node.
 * @param meta The registered ActionMeta/TriggerMeta for this node, when the
 *   caller resolved it from the discovery registry. Presence is the
 *   grounding signal that a provider node is a real, registered action;
 *   absence on a non-native action node yields `unknown_node`. Native nodes
 *   are classified from `node.type` regardless of `meta`.
 */
export function classifyNodeTaskCost(
  node: Pick<WorkflowNode, "kind" | "provider" | "type">,
  meta?: ActionMeta | TriggerMeta,
): NodeTaskCost {
  // 1. Triggers never bill — listening for / firing a trigger is free; the
  //    billable action nodes inside the run carry the cost. Checked BEFORE
  //    the override map so an override can never make a trigger billable.
  if (node.kind === "trigger") {
    return nonBillable("trigger");
  }

  // 2. Explicit central override wins over every category default
  //    (e.g. native:http_request → billable; future bulk/premium nodes).
  const override = getTaskCostOverride(node.provider, node.type, node.kind);
  if (override) {
    return fromOverride(override);
  }

  // 3. Native actions are a closed in-repo set — classify by type directly.
  if (node.provider === NATIVE_PROVIDER) {
    if (NATIVE_ZERO_COST_ACTION_TYPES.has(node.type)) {
      return nonBillable("native_control_flow");
    }
    // Unrecognized native type (e.g. transient empty type, or a native
    // action not yet taught to the policy / override map).
    return nonBillable("unknown_node");
  }

  // 4. Provider actions — billable on success, but only when grounded by a
  //    registered meta. No meta ⇒ we cannot confirm it is a real action.
  if (meta) {
    return billableOnSuccess("provider_action");
  }

  // 5. Ungrounded provider node — safe non-billable + unknown signal so the
  //    estimator can surface a warning rather than silently charging.
  return nonBillable("unknown_node");
}

/** Convenience predicate over `classifyNodeTaskCost`. */
export function isBillableNode(
  node: Pick<WorkflowNode, "kind" | "provider" | "type">,
  meta?: ActionMeta | TriggerMeta,
): boolean {
  return classifyNodeTaskCost(node, meta).billable;
}
