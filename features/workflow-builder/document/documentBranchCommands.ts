import type { ActionMeta } from "@/contracts/actionMeta";
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { isAdvancedBranchingNode, nodeTypeKey } from "@/core/workflows/advancedBranching";
import { returnableBranchLabels } from "@/core/workflows/branchWiring";
import { ifThenConditionMeta } from "@/integrations/native/actions/ifThenCondition.meta";
import { routerMeta } from "@/integrations/native/actions/router.meta";
import { ROUTER_MAX_ROUTES, ROUTE_LABEL_MAX } from "@/integrations/native/actions/router.schema";
import { useGraphSlice } from "../state/graphSlice";
import { insertActionAtEdge } from "../utils/insertActionAtEdge";
import { computeNonOverlappingPosition } from "../utils/workflowLayout";
import { buildLaneContext, findForkBlock } from "./documentBranchContext";
import {
  validateDocumentBranchLaneInsertion,
  validateDocumentEdgeInsertion,
  validateDocumentTailAdd,
  type DocumentCommandRefusal,
} from "./documentCommands";
import { projectDefinitionToDocument } from "./projection";
import { MAX_FORK_DEPTH } from "./projectionTiers";

/**
 * 5.DUAL-BUILDER-1 CS-5 — the Document BRANCH-authoring command boundary.
 *
 * Thin, typed, NON-THROWING compositions over the EXISTING canonical actions
 * (graphSlice add/insert/connect/updateNodeConfig + the shared
 * `insertActionAtEdge`) — never a Document-specific branch schema, route model,
 * condition engine, validation, entitlement source, save path, or execution
 * behavior. Branch identity is the persisted `edge.label`; lanes are the native
 * If/Then true/false labels and Router `config.routes[].label`. Every command
 * re-reads LIVE `graphSlice` state, refuses stale/ambiguous interactions with a
 * typed reason (no raw throw into components), and never partially mutates after
 * a refusal (all validation precedes the first mutation).
 *
 * Entitlement stays the EXISTING `advanced_branching` gate: creation commands
 * refuse a Free client gesture (`plan_feature_required`) WITHOUT mutating, and
 * the authoritative server save/apply/run gates remain the real enforcement —
 * this is a client refusal, not a second entitlement source.
 */

export type DocumentBranchResult =
  | { readonly ok: true; readonly nodeId?: string }
  | { readonly ok: false; readonly reason: DocumentBranchRefusal };

export type DocumentBranchRefusal =
  | "node_missing"
  | "edge_missing"
  | "no_draft"
  | "stale_document_model"
  | "invalid_branch_source"
  | "invalid_route_config"
  | "duplicate_route_label"
  | "stale_route_label"
  | "ambiguous_lane"
  | "unsupported_region"
  | "nesting_depth_exceeded"
  | "plan_feature_required"
  | "destructive_confirmation_required"
  | "branching_not_supported_here";

const refuse = (reason: DocumentBranchRefusal): DocumentBranchResult => ({ ok: false, reason });

/** A structurally-safe Document location to insert a new branch node. */
export type BranchInsertLocation =
  | { readonly kind: "tail"; readonly anchorNodeId: string }
  | {
      readonly kind: "between";
      readonly edgeId: string;
      readonly expectedFrom: string;
      readonly expectedTo: string;
    }
  | {
      readonly kind: "laneStart";
      readonly edgeId: string;
      readonly expectedFrom: string;
      readonly expectedTo: string;
      readonly expectedLabel: string;
    };

/** Map a CS-2/2B insertion-validation refusal onto the CS-5 branch vocabulary. */
function mapInsertRefusal(reason: DocumentCommandRefusal): DocumentBranchRefusal {
  switch (reason) {
    case "node_missing":
      return "node_missing";
    case "edge_missing":
      return "edge_missing";
    case "ambiguous_insertion":
      return "ambiguous_lane";
    case "invalid_branch_source":
      return "invalid_branch_source";
    case "stale_branch_label":
      return "stale_route_label";
    case "unsupported_region":
      return "unsupported_region";
    default:
      return "stale_document_model";
  }
}

/**
 * Validate an insertion location against LIVE store state and, for a lane-start
 * insertion, that the resulting nested fork stays within `MAX_FORK_DEPTH`.
 */
function validateBranchLocation(location: BranchInsertLocation): DocumentBranchResult {
  if (location.kind === "tail") {
    const check = validateDocumentTailAdd({ anchorNodeId: location.anchorNodeId });
    return check.ok ? { ok: true } : refuse(mapInsertRefusal(check.reason));
  }
  if (location.kind === "between") {
    const check = validateDocumentEdgeInsertion({
      edgeId: location.edgeId,
      expectedFrom: location.expectedFrom,
      expectedTo: location.expectedTo,
    });
    return check.ok ? { ok: true } : refuse(mapInsertRefusal(check.reason));
  }
  // laneStart — a healthy returnable labeled lane entry (CS-2B validator), plus
  // a nesting-depth guard so the Document never authors an over-deep fork.
  const check = validateDocumentBranchLaneInsertion({
    edgeId: location.edgeId,
    expectedFrom: location.expectedFrom,
    expectedTo: location.expectedTo,
    expectedLabel: location.expectedLabel,
  });
  if (!check.ok) return refuse(mapInsertRefusal(check.reason));

  const { pendingNodes, pendingEdges } = useGraphSlice.getState();
  const model = projectDefinitionToDocument({ nodes: pendingNodes, edges: pendingEdges });
  const parentFork = findForkBlock(model, location.expectedFrom);
  // The parent fork must be a cleanly-rendered (Tier A) fork; otherwise the
  // region is not safely editable from the Document.
  if (!parentFork) return refuse("unsupported_region");
  // A new fork nested in this lane renders at parentFork.depth + 1; beyond
  // MAX_FORK_DEPTH it degrades to a read-only Visual handoff.
  if (parentFork.depth + 1 >= MAX_FORK_DEPTH) return refuse("nesting_depth_exceeded");
  return { ok: true };
}

/** Entitlement client-gate: Free (=== false) refuses without mutation. */
function entitlementBlocks(canUseAdvancedBranching: boolean | undefined): boolean {
  return canUseAdvancedBranching === false;
}

/**
 * Insert an If/Then node onto an existing edge, wiring BOTH the `true` and
 * `false` continuations to the edge's original downstream node (so it becomes
 * the fork's single rejoin) and preserving the edge's own branch label on the
 * upstream half. `A --[L?]--> B` becomes `A --[L?]--> IF`, `IF --[true]--> B`,
 * `IF --[false]--> B`. No fabricated no-op node; B is the real continuation.
 */
function insertIfThenOnEdge(edgeId: string): string | null {
  const before = useGraphSlice.getState();
  const edge = before.pendingEdges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const fromId = edge.from;
  const toId = edge.to;
  const label = edge.label;
  const fromNode = before.pendingNodes.find((n) => n.id === fromId);

  // addActionFromMeta seeds the default config (onFalse:"branch") via
  // deriveDefaultConfig(fields[].defaultValue).
  const ifNode = useGraphSlice.getState().addActionFromMeta(ifThenConditionMeta);

  // Drop the auto-edge addAction created (chainTail → IF); we rewire explicitly.
  const auto = useGraphSlice
    .getState()
    .pendingEdges.find((e) => e.to === ifNode.id && e.id !== edgeId);
  if (auto) useGraphSlice.getState().removeEdge(auto.id);
  useGraphSlice.getState().removeEdge(edgeId);

  try {
    useGraphSlice
      .getState()
      .connectNodes({ from: fromId, to: ifNode.id, ...(label !== undefined ? { label } : {}) });
    useGraphSlice.getState().connectNodes({ from: ifNode.id, to: toId, label: "true" });
    useGraphSlice.getState().connectNodes({ from: ifNode.id, to: toId, label: "false" });
  } catch {
    // connectNodes only throws on self-loop / duplicate / unknown endpoint; the
    // IF id is fresh with two known endpoints, so none apply. Never half-wire.
  }

  if (fromNode) {
    const others = useGraphSlice.getState().pendingNodes.filter((n) => n.id !== ifNode.id);
    useGraphSlice
      .getState()
      .updateNodePosition(ifNode.id, computeNonOverlappingPosition(fromNode.position, others));
  }
  return ifNode.id;
}

/**
 * CS-5 — add an If/Then branch at a structurally-safe Document location.
 *   - tail: the If/Then is appended; both lanes start unwired (visible
 *     `missing_branch_edge` warnings — acceptable per the plan until each lane
 *     gets a next step).
 *   - between / laneStart: both lanes wire to the preserved downstream node,
 *     which becomes the fork's single rejoin.
 */
export function createDocumentIfThenBranch(input: {
  location: BranchInsertLocation;
  canUseAdvancedBranching?: boolean | undefined;
}): DocumentBranchResult {
  if (entitlementBlocks(input.canUseAdvancedBranching)) return refuse("plan_feature_required");
  const valid = validateBranchLocation(input.location);
  if (!valid.ok) return valid;

  if (input.location.kind === "tail") {
    const node = useGraphSlice
      .getState()
      .addActionAfterFromMeta(input.location.anchorNodeId, ifThenConditionMeta);
    return { ok: true, nodeId: node.id };
  }
  const nodeId = insertIfThenOnEdge(input.location.edgeId);
  return nodeId ? { ok: true, nodeId } : refuse("stale_document_model");
}

/**
 * CS-5 — add a Router branch at a structurally-safe Document location. The
 * router is inserted with NO routes yet; the caller opens the existing
 * `router-routes` renderer (inspector) so the author configures routes. A
 * between/laneStart insertion preserves the downstream node as the router's
 * unlabeled always-run continuation (never a fabricated node). Returns the new
 * node id so the UI can open its configuration.
 */
export function createDocumentRouterBranch(input: {
  location: BranchInsertLocation;
  canUseAdvancedBranching?: boolean | undefined;
}): DocumentBranchResult {
  if (entitlementBlocks(input.canUseAdvancedBranching)) return refuse("plan_feature_required");
  const valid = validateBranchLocation(input.location);
  if (!valid.ok) return valid;

  if (input.location.kind === "tail") {
    const node = useGraphSlice.getState().addActionAfterFromMeta(input.location.anchorNodeId, routerMeta);
    return { ok: true, nodeId: node.id };
  }
  // between / laneStart — reuse the shared insertActionAtEdge composition, which
  // preserves the upstream branch label and leaves an unlabeled continuation.
  const beforeIds = new Set(useGraphSlice.getState().pendingNodes.map((n) => n.id));
  insertActionAtEdge(input.location.edgeId, routerMeta);
  const created = useGraphSlice.getState().pendingNodes.find((n) => !beforeIds.has(n.id));
  return created ? { ok: true, nodeId: created.id } : refuse("stale_document_model");
}

/** Read a node and assert it is a native branching node (else typed refusal). */
function requireBranchingNode(nodeId: string):
  | { ok: true; node: WorkflowNode }
  | { ok: false; result: DocumentBranchResult } {
  const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === nodeId);
  if (!node) return { ok: false, result: refuse("node_missing") };
  if (!isAdvancedBranchingNode(node)) return { ok: false, result: refuse("invalid_branch_source") };
  return { ok: true, node };
}

/**
 * CS-5 — edit an existing If/Then condition from the Document. Merges the patch
 * into the node's real config and commits through the SAME `updateNodeConfig`
 * the inspector uses (so a `onFalse: "branch" → "skip"` change reconciles the
 * now-unreturnable `false` edge, and `skip → branch` re-exposes an unwired
 * `false` lane). No second condition parser — the authoritative If/Then schema
 * stays the runtime authority.
 */
export function updateDocumentIfThenCondition(input: {
  nodeId: string;
  patch: Readonly<Record<string, unknown>>;
}): DocumentBranchResult {
  const got = requireBranchingNode(input.nodeId);
  if (!got.ok) return got.result;
  if (nodeTypeKey(got.node) !== "native:if_then_condition") return refuse("invalid_branch_source");
  const nextConfig = { ...(got.node.config ?? {}), ...input.patch };
  useGraphSlice.getState().updateNodeConfig(input.nodeId, nextConfig);
  return { ok: true };
}

function routerRoutes(node: WorkflowNode): Array<Record<string, unknown>> {
  const routes = (node.config ?? {}).routes;
  return Array.isArray(routes) ? (routes as Array<Record<string, unknown>>) : [];
}

/**
 * CS-5 — append a Router route. The new label becomes immediately returnable, so
 * its lane appears at once (initially with a `missing_branch_edge` warning until
 * it gets a next step). Refuses a duplicate label, an over-cap route count, an
 * empty/too-long label, or a non-router node. Commits via `updateNodeConfig`.
 */
export function addDocumentBranchRoute(input: {
  nodeId: string;
  label: string;
  condition?: Readonly<Record<string, unknown>>;
}): DocumentBranchResult {
  const got = requireBranchingNode(input.nodeId);
  if (!got.ok) return got.result;
  if (nodeTypeKey(got.node) !== "native:router") return refuse("invalid_branch_source");
  const label = input.label.trim();
  if (label.length === 0 || label.length > ROUTE_LABEL_MAX) return refuse("invalid_route_config");
  const routes = routerRoutes(got.node);
  if (routes.length >= ROUTER_MAX_ROUTES) return refuse("invalid_route_config");
  if (routes.some((r) => r.label === label)) return refuse("duplicate_route_label");
  const condition = input.condition ?? { input: "", operator: "equals", value: "" };
  const nextRoutes = [...routes, { label, condition }];
  useGraphSlice
    .getState()
    .updateNodeConfig(input.nodeId, { ...(got.node.config ?? {}), routes: nextRoutes });
  return { ok: true };
}

/** All node ids reachable from `roots` over `edges` (optionally dropping some). */
function reachable(
  roots: readonly string[],
  edges: readonly WorkflowEdge[],
  dropEdgeIds: ReadonlySet<string>,
): Set<string> {
  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (dropEdgeIds.has(e.id)) continue;
    const bucket = out.get(e.from);
    if (bucket) bucket.push(e.to);
    else out.set(e.from, [e.to]);
  }
  const seen = new Set<string>(roots);
  const stack = [...roots];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const to of out.get(id) ?? []) {
      if (!seen.has(to)) {
        seen.add(to);
        stack.push(to);
      }
    }
  }
  return seen;
}

/**
 * CS-5 — remove a Router route. Safe default (planning doc): drop the route
 * label from config and let `updateNodeConfig` reconciliation DETACH only that
 * route's labeled edge(s); downstream nodes STAY in the graph (a newly
 * unreachable node is surfaced by the existing validation, never silently
 * deleted). When executable nodes are reachable ONLY through this lane, refuse
 * with `destructive_confirmation_required` unless the caller passed `confirmed`.
 */
export function removeDocumentBranchRoute(input: {
  nodeId: string;
  label: string;
  confirmed?: boolean;
}): DocumentBranchResult {
  const got = requireBranchingNode(input.nodeId);
  if (!got.ok) return got.result;
  if (nodeTypeKey(got.node) !== "native:router") return refuse("invalid_branch_source");
  const routes = routerRoutes(got.node);
  if (!routes.some((r) => r.label === input.label)) return refuse("stale_route_label");

  const { pendingNodes, pendingEdges } = useGraphSlice.getState();
  const trigger = pendingNodes.find((n) => n.kind === "trigger");
  const roots = trigger ? [trigger.id] : pendingNodes.filter((n) => !pendingEdges.some((e) => e.to === n.id)).map((n) => n.id);
  const droppedEdgeIds = new Set(
    pendingEdges.filter((e) => e.from === input.nodeId && e.label === input.label).map((e) => e.id),
  );
  if (input.confirmed !== true && droppedEdgeIds.size > 0) {
    const before = reachable(roots, pendingEdges, new Set());
    const after = reachable(roots, pendingEdges, droppedEdgeIds);
    const newlyUnreachable = [...before].some(
      (id) => !after.has(id) && pendingNodes.some((n) => n.id === id && n.kind === "action"),
    );
    if (newlyUnreachable) return refuse("destructive_confirmation_required");
  }

  const nextRoutes = routes.filter((r) => r.label !== input.label);
  const nextConfig: Record<string, unknown> = { ...(got.node.config ?? {}), routes: nextRoutes };
  // A defaultRoute pointing at the removed label is cleared (it can no longer resolve).
  if (nextConfig.defaultRoute === input.label) delete nextConfig.defaultRoute;
  useGraphSlice.getState().updateNodeConfig(input.nodeId, nextConfig);
  return { ok: true };
}

/**
 * CS-5 — rename a Router route, preserving its wiring (route-identity decision
 * "approach 2"). Delegates to the atomic `graphSlice.renameBranchRouteLabel`
 * transaction (config route label + this node's matching outgoing edge labels
 * rewritten in one history-captured edit). Length cap enforced here before the
 * store call.
 */
export function renameDocumentBranchRoute(input: {
  nodeId: string;
  oldLabel: string;
  newLabel: string;
}): DocumentBranchResult {
  const trimmed = input.newLabel.trim();
  if (trimmed.length === 0 || trimmed.length > ROUTE_LABEL_MAX) return refuse("invalid_route_config");
  const result = useGraphSlice.getState().renameBranchRouteLabel(input.nodeId, input.oldLabel, trimmed);
  if (result.ok) return { ok: true };
  switch (result.reason) {
    case "node_missing":
      return refuse("node_missing");
    case "not_router":
      return refuse("invalid_branch_source");
    case "invalid_label":
    case "invalid_route_config":
      return refuse("invalid_route_config");
    case "stale_route_label":
      return refuse("stale_route_label");
    case "duplicate_route_label":
      return refuse("duplicate_route_label");
  }
}

/**
 * CS-5 — add an ordinary action into an EMPTY branch lane (a returnable route
 * with no destination — the `missing_branch_edge` case). Creates the node via
 * the shared `addActionAfterFromMeta` then relabels its entry edge to the
 * lane's route label, so the new node becomes the lane's first step. Refuses if
 * the lane already has a destination (that is the CS-2B lane-INSERT case).
 */
export function addDocumentActionToEmptyLane(input: {
  forkNodeId: string;
  label: string;
  meta: ActionMeta;
}): DocumentBranchResult {
  const got = requireBranchingNode(input.forkNodeId);
  if (!got.ok) return got.result;
  const vocabulary = returnableBranchLabels(got.node);
  if (vocabulary === null || !vocabulary.includes(input.label)) return refuse("stale_route_label");
  const existing = useGraphSlice
    .getState()
    .pendingEdges.filter((e) => e.from === input.forkNodeId && e.label === input.label);
  if (existing.length > 0) return refuse("ambiguous_lane");

  const node = useGraphSlice.getState().addActionAfterFromMeta(input.forkNodeId, input.meta);
  // addActionAfter created `fork --> node` UNLABELED; replace it with the route
  // label so the node lands in this lane (labeled first, then drop the auto edge).
  const auto = useGraphSlice
    .getState()
    .pendingEdges.find((e) => e.from === input.forkNodeId && e.to === node.id && e.label === undefined);
  try {
    useGraphSlice.getState().connectNodes({ from: input.forkNodeId, to: node.id, label: input.label });
  } catch {
    // Fresh (fork, node, label) can't collide; never half-wire.
  }
  if (auto) useGraphSlice.getState().removeEdge(auto.id);
  return { ok: true, nodeId: node.id };
}

/**
 * CS-5 — resolve a sibling-lane navigation target (FOCUS ONLY; never mutates).
 * Given the node currently in focus and the sibling lane's route label, returns
 * the node to scroll/focus: the sibling lane's first step, or the fork header
 * when the sibling lane is empty. Refuses a stale source or an unknown sibling.
 */
export function resolveDocumentSiblingLane(input: {
  fromNodeId: string;
  targetLabel: string;
}): DocumentBranchResult {
  const { pendingNodes, pendingEdges } = useGraphSlice.getState();
  if (!pendingNodes.some((n) => n.id === input.fromNodeId)) return refuse("node_missing");
  const model = projectDefinitionToDocument({ nodes: pendingNodes, edges: pendingEdges });
  const ctx = buildLaneContext(model, input.fromNodeId);
  if (!ctx || ctx.forkNodeId === null) return refuse("unsupported_region");
  const sibling = ctx.siblings.find((s) => s.label === input.targetLabel);
  if (!sibling) return refuse("ambiguous_lane");
  return { ok: true, nodeId: sibling.firstNodeId ?? ctx.forkNodeId };
}

/** Plain-language copy for a typed branch refusal (never a raw error in the UI). */
export function describeBranchRefusal(reason: DocumentBranchRefusal): string {
  switch (reason) {
    case "node_missing":
      return "That step isn't here anymore — it may have been removed.";
    case "edge_missing":
      return "That connection isn't here anymore.";
    case "no_draft":
      return "There was nothing to save for that step.";
    case "stale_document_model":
      return "This part of the workflow changed — take another look and try again.";
    case "invalid_branch_source":
      return "This isn't a branch the Document can edit here. Open the Visual Builder.";
    case "invalid_route_config":
      return "That route name needs to be between 1 and 64 characters.";
    case "duplicate_route_label":
      return "There's already a route with that name — pick a different one.";
    case "stale_route_label":
      return "That route no longer exists on this branch. Review the workflow and try again.";
    case "ambiguous_lane":
      return "There's more than one path here, so it's not clear where the step should go. Add it on the canvas.";
    case "unsupported_region":
      return "This branch shape is easier to edit in the Visual Builder.";
    case "nesting_depth_exceeded":
      return "This branch is nested as deep as the Document shows. Add the next split on the canvas.";
    case "plan_feature_required":
      return "Branches are a Pro feature. Upgrade to add If/Then and Router steps.";
    case "destructive_confirmation_required":
      return "Removing this route would strand steps that only run on it. Confirm to remove it anyway.";
    case "branching_not_supported_here":
      return "A branch can't be added at this spot. Add it on the canvas.";
  }
}
