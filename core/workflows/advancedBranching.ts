import type {
  WorkflowDefinition,
  WorkflowNode,
} from "@/contracts/workflowDefinition";

/**
 * Canonical classifier for the paid `advanced_branching` capability (BRANCH-ENT-1).
 *
 * Pure — no DB, no I/O (core/ may import only contracts/). This is the ONE place that
 * says which node types count as advanced branching. Every enforcement boundary
 * (builder availability, definition save, AI patch validation, template
 * instantiation, activation/publish preflights, the engine pre-execution gate) and
 * the patch-layer branch-label sanity check reuse this set — never a local copy.
 *
 * Deliberately NOT classified as advanced branching:
 *   - labeled edges by themselves (any future node may consume the engine's labeled
 *     edge primitive; the capability gates the product feature, not the primitive);
 *   - the shared condition evaluator (`integrations/native/actions/_conditionEvaluator`);
 *   - engine traversal / `branchTaken` plumbing.
 *
 * If/Then Condition in its `onFalse: "skip"` (filter-style) configuration is the SAME
 * node type / library entry / handler, so it is restricted with the node. A separate
 * Free-safe linear Filter node is a documented follow-up product decision, not a
 * config-sensitive carve-out here (config-sensitive classification would create a
 * flip-after-save bypass surface).
 */

/** Capability identifier used in typed errors, policy checks, and telemetry. */
export const ADVANCED_BRANCHING_CAPABILITY = "advanced_branching" as const;

/** Minimum plan tier that includes the capability (for user-facing copy/CTAs). */
export const ADVANCED_BRANCHING_MIN_PLAN = "pro" as const;

/**
 * The closed set of `${provider}:${type}` node keys that are advanced branching.
 * Matches the handlers that return a route-selecting `branchTaken`.
 */
export const ADVANCED_BRANCHING_NODE_TYPES: ReadonlySet<string> = new Set([
  "native:if_then_condition",
  "native:router",
]);

/** The `${provider}:${type}` dispatch key for a node. */
export function nodeTypeKey(
  node: Pick<WorkflowNode, "provider" | "type">,
): string {
  return `${node.provider}:${node.type}`;
}

/** True when a `${provider}:${type}` key is an advanced-branching node type. */
export function isAdvancedBranchingTypeKey(typeKey: string): boolean {
  return ADVANCED_BRANCHING_NODE_TYPES.has(typeKey);
}

/** True when `node` is an advanced-branching node (If/Then Condition or Router). */
export function isAdvancedBranchingNode(
  node: Pick<WorkflowNode, "provider" | "type">,
): boolean {
  return isAdvancedBranchingTypeKey(nodeTypeKey(node));
}

/**
 * Node ids of every advanced-branching node in `definition`, in definition order.
 * Used to build actionable error messages ("remove the branching node(s) …").
 */
export function advancedBranchingNodeIds(
  definition: Pick<WorkflowDefinition, "nodes">,
): string[] {
  return definition.nodes
    .filter((node) => isAdvancedBranchingNode(node))
    .map((node) => node.id);
}

/** True when `definition` contains at least one advanced-branching node. */
export function definitionUsesAdvancedBranching(
  definition: Pick<WorkflowDefinition, "nodes">,
): boolean {
  return definition.nodes.some((node) => isAdvancedBranchingNode(node));
}
