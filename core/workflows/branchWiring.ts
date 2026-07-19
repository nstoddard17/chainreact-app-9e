import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import {
  isAdvancedBranchingNode,
  nodeTypeKey,
} from "./advancedBranching";

/**
 * Branch-wiring validation (BRANCH-ENT-1 routing fix D3) — pure, core-resident.
 *
 * Predicts the engine's label-activation behavior at validation time so a
 * miswired branching graph is caught in the builder / readiness gates instead
 * of failing mid-run with INVALID_BRANCH or silently never running a path:
 *
 *   - `missing_branch_edge` — a label the node's handler can RETURN
 *     (`"true"`/`"false"` for If/Then per `onFalse`; every route label +
 *     `defaultRoute` for Router) has no matching outgoing edge. At runtime that
 *     selection would fail the run with INVALID_BRANCH.
 *   - `stale_branch_edge` — a labeled outgoing edge of a BRANCHING node whose
 *     label the node can never return: a renamed/removed route, or a False
 *     edge left behind after switching to "skip". Such an edge never
 *     activates — a silent dead path.
 *
 * Unlabeled edges are never flagged: they are the legitimate always-run
 * cleanup path (engine §6.2.a). Labeled edges out of NON-branching nodes are
 * deliberately NOT a blocking issue here: the engine contract lets any future
 * handler emit `branchTaken` (§6.2.a permissive default), and the AI patch
 * layer already surfaces them as the SUSPICIOUS_BRANCH_LABEL warning.
 *
 * Config is parsed DEFENSIVELY: an unconfigured/malformed Router returns no
 * vocabulary (the builder's `router_routes_invalid` + required-field checks own
 * that state), and the handler's strict Zod schema stays the runtime authority.
 */

export interface BranchWiringIssue {
  readonly code: "missing_branch_edge" | "stale_branch_edge";
  readonly message: string;
  /** The branching node (or labeled-edge source) the issue belongs to. */
  readonly nodeId: string;
  readonly displayName: string;
  /** The route label that is missing or stale. */
  readonly branchLabel: string;
  /** Set for stale_branch_edge. */
  readonly edgeId?: string;
  readonly from?: string;
  readonly to?: string;
}

function friendlyName(node: WorkflowNode): string {
  return node.displayName ?? node.type ?? "This step";
}

/**
 * The branch labels `node`'s handler can return, or `null` when the node has
 * no (checkable) label vocabulary — non-branching nodes, and branching nodes
 * whose config is not yet well-formed enough to know.
 */
export function returnableBranchLabels(node: WorkflowNode): readonly string[] | null {
  if (!isAdvancedBranchingNode(node)) return null;
  const key = nodeTypeKey(node);
  const config = (node.config ?? {}) as Record<string, unknown>;

  if (key === "native:if_then_condition") {
    // Schema default for `onFalse` is "branch"; anything but an explicit
    // "skip" therefore needs a False route.
    return config.onFalse === "skip" ? ["true"] : ["true", "false"];
  }

  // native:router — vocabulary comes from routes[].label + defaultRoute.
  const routes = config.routes;
  if (!Array.isArray(routes) || routes.length === 0) return null;
  const labels: string[] = [];
  for (const route of routes) {
    const label = (route as { label?: unknown } | null)?.label;
    if (typeof label !== "string" || label.trim() === "") return null;
    labels.push(label);
  }
  const defaultRoute = config.defaultRoute;
  if (typeof defaultRoute === "string" && defaultRoute.trim() !== "") {
    labels.push(defaultRoute);
  }
  return [...new Set(labels)];
}

/**
 * Detect branch-wiring breaks across the graph. Dangling edges (endpoint node
 * missing) are ignored here — `stale_edge` already reports them.
 */
export function findBranchWiringIssues(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): readonly BranchWiringIssue[] {
  const issues: BranchWiringIssue[] = [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const labeledOutgoing = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    if (edge.label === undefined) continue;
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
    const bucket = labeledOutgoing.get(edge.from);
    if (bucket) bucket.push(edge);
    else labeledOutgoing.set(edge.from, [edge]);
  }

  for (const node of nodes) {
    const outgoing = labeledOutgoing.get(node.id) ?? [];
    const vocabulary = returnableBranchLabels(node);

    // Non-branching sources are never blocked here (see module doc), and a
    // branching node with unusable config is owned by routes validation.
    if (vocabulary === null) continue;

    const vocabularySet = new Set(vocabulary);
    const connected = new Set(outgoing.map((e) => e.label!));

    for (const label of vocabulary) {
      if (!connected.has(label)) {
        issues.push({
          code: "missing_branch_edge",
          nodeId: node.id,
          displayName: friendlyName(node),
          branchLabel: label,
          message: `Connect the "${label}" route of ${friendlyName(node)} — it has no destination, so a "${label}" result would fail the run.`,
        });
      }
    }

    for (const edge of outgoing) {
      if (!vocabularySet.has(edge.label!)) {
        issues.push({
          code: "stale_branch_edge",
          nodeId: node.id,
          displayName: friendlyName(node),
          branchLabel: edge.label!,
          edgeId: edge.id,
          from: edge.from,
          to: edge.to,
          message: `${friendlyName(node)} has no "${edge.label}" route anymore, so that connection would never run. Remove it or reconnect it to a current route.`,
        });
      }
    }
  }

  return issues;
}
