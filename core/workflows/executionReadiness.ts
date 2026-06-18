import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import {
  type RequiredFieldsByType,
  missingRequiredFields,
  requirementLookupKey,
} from "./requiredFields";
import { findSelfLoopEdges } from "./selfLoopEdges";

/**
 * Shared execution-readiness validator (B).
 *
 * ONE pure validator for "is this workflow runnable", covering BOTH:
 *   1. graph integrity / connectivity (this file), and
 *   2. required config fields (delegated to `missingRequiredFields`).
 *
 * Pure + `core/`-resident so it is the single source of truth for builder
 * readiness (header pill / ValidationSummary), the Run-Manually preflight, the
 * Activate gate, and the engine pre-dispatch backstop — no surface can disagree
 * with another, and no second ruleset exists.
 *
 * Handler Zod schemas remain the final runtime safety net; this is the friendly
 * pre-run gate.
 */

export type GraphIssueCode =
  | "no_trigger"
  | "multiple_triggers"
  | "stale_edge"
  | "self_loop_edge"
  | "unreachable_node";

export interface GraphIssue {
  readonly code: GraphIssueCode;
  /** Author-facing, plain-English message. */
  readonly message: string;
  /** Set for node-scoped issues (multiple_triggers, unreachable_node). */
  readonly nodeId?: string;
  /** Friendly node name for node-scoped issues. */
  readonly displayName?: string;
  /** Set for stale_edge. */
  readonly edgeId?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface ReadinessFieldGap {
  readonly nodeId: string;
  readonly displayName: string;
  /** Author-facing labels of the empty required fields, e.g. ["Method", "URL"]. */
  readonly missingFields: readonly string[];
}

export interface ExecutionReadinessResult {
  readonly ok: boolean;
  readonly graphIssues: readonly GraphIssue[];
  readonly fieldGaps: readonly ReadinessFieldGap[];
}

/**
 * Structural integrity of the graph, independent of node config:
 *   - exactly one trigger,
 *   - every edge references existing source AND target nodes,
 *   - every non-trigger node is reachable from a trigger (no orphans).
 *
 * Reachability uses only edges whose endpoints both exist (stale edges are
 * reported separately and never used to "rescue" an otherwise-orphan node).
 */
export function findGraphIssues(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): readonly GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const triggers = nodes.filter((n) => n.kind === "trigger");

  if (triggers.length === 0) {
    issues.push({ code: "no_trigger", message: "Add a trigger to your workflow." });
  } else if (triggers.length > 1) {
    // Flag every extra trigger so the UI can point at each one.
    for (const extra of triggers.slice(1)) {
      issues.push({
        code: "multiple_triggers",
        nodeId: extra.id,
        displayName: extra.displayName ?? extra.type ?? "Trigger",
        message: "Only one trigger is allowed per workflow.",
      });
    }
  }

  for (const edge of edges) {
    const fromMissing = !nodeById.has(edge.from);
    const toMissing = !nodeById.has(edge.to);
    if (fromMissing || toMissing) {
      issues.push({
        code: "stale_edge",
        edgeId: edge.id,
        from: edge.from,
        to: edge.to,
        message:
          "A connection points to a node that no longer exists. Remove it and reconnect the steps.",
      });
    }
  }

  // Self-loop edges (from === to — a step wired to itself). Promoted into the shared
  // runtime verdict (AI-READINESS-CONVERGENCE CS-1) so Activate / run-now / engine
  // pre-dispatch reject it, not just Check. Reuses the canonical `findSelfLoopEdges`
  // detector — the same definition the deterministic `removeEdge` repair uses — so the
  // gate and the repair can never disagree. Carries internal ids only (no node name);
  // the diagnosis layer adds safe display labels separately.
  for (const sl of findSelfLoopEdges(edges)) {
    issues.push({
      code: "self_loop_edge",
      edgeId: sl.edgeId,
      nodeId: sl.nodeId,
      from: sl.nodeId,
      to: sl.nodeId,
      message: "A step is connected to itself. Remove the self-connection.",
    });
  }

  // Reachability — only meaningful when at least one trigger exists.
  if (triggers.length > 0) {
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
      const bucket = adjacency.get(edge.from);
      if (bucket) bucket.push(edge.to);
      else adjacency.set(edge.from, [edge.to]);
    }
    const reachable = new Set<string>();
    const stack = triggers.map((t) => t.id);
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const next of adjacency.get(id) ?? []) stack.push(next);
    }
    for (const node of nodes) {
      if (node.kind === "trigger") continue;
      if (!reachable.has(node.id)) {
        issues.push({
          code: "unreachable_node",
          nodeId: node.id,
          displayName: node.displayName ?? node.type ?? "Action",
          message: `${node.displayName ?? node.type ?? "This action"} isn't connected to the trigger, so it won't run.`,
        });
      }
    }
  }

  return issues;
}

/**
 * Empty required fields per node, with friendly labels. Mirrors the builder's
 * "Needs setup" per-node signal.
 */
export function findFieldGaps(
  nodes: readonly WorkflowNode[],
  requiredFieldsByType: RequiredFieldsByType | undefined,
): readonly ReadinessFieldGap[] {
  const gaps: ReadinessFieldGap[] = [];
  for (const node of nodes) {
    const missing = missingRequiredFields(node, requiredFieldsByType);
    if (missing.length === 0) continue;
    const reqs = requiredFieldsByType?.[requirementLookupKey(node)];
    gaps.push({
      nodeId: node.id,
      displayName: node.displayName ?? reqs?.displayName ?? node.type,
      missingFields: missing.map((f) => f.label),
    });
  }
  return gaps;
}

export interface EvaluateExecutionReadinessInput {
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
  readonly requiredFieldsByType: RequiredFieldsByType | undefined;
}

/** Combined readiness verdict: graph integrity + required fields. */
export function evaluateExecutionReadiness(
  input: EvaluateExecutionReadinessInput,
): ExecutionReadinessResult {
  const graphIssues = findGraphIssues(input.nodes, input.edges);
  const fieldGaps = findFieldGaps(input.nodes, input.requiredFieldsByType);
  return {
    ok: graphIssues.length === 0 && fieldGaps.length === 0,
    graphIssues,
    fieldGaps,
  };
}

/**
 * Typed, user-facing error for a server execution surface (run-now, activate,
 * engine). Returns `null` when the workflow is ready.
 *
 * Precedence: GRAPH integrity first (a structurally-broken workflow can't run at
 * all), then MISSING_REQUIRED_FIELDS — so a ready-graph-but-missing-config
 * workflow returns the same MISSING_REQUIRED_FIELDS shape A shipped.
 */
export type ReadinessError =
  | {
      readonly error: "INVALID_WORKFLOW_GRAPH";
      readonly message: string;
      readonly graph: readonly GraphIssue[];
    }
  | {
      readonly error: "MISSING_REQUIRED_FIELDS";
      readonly message: string;
      readonly nodes: readonly ReadinessFieldGap[];
    };

function formatFieldGapMessage(gaps: readonly ReadinessFieldGap[]): string {
  const first = gaps[0];
  if (!first) return "A node is missing required fields.";
  const base = `${first.displayName} is missing required fields: ${first.missingFields.join(", ")}.`;
  if (gaps.length === 1) return base;
  const others = gaps.length - 1;
  return `${base} (${others} other node${others === 1 ? "" : "s"} also need${others === 1 ? "s" : ""} setup.)`;
}

function formatGraphMessage(issues: readonly GraphIssue[]): string {
  const first = issues[0];
  if (!first) return "This workflow's structure is invalid.";
  if (issues.length === 1) return first.message;
  const others = issues.length - 1;
  return `${first.message} (${others} other workflow-structure issue${others === 1 ? "" : "s"}.)`;
}

export function toReadinessError(
  result: ExecutionReadinessResult,
): ReadinessError | null {
  if (result.ok) return null;
  if (result.graphIssues.length > 0) {
    return {
      error: "INVALID_WORKFLOW_GRAPH",
      message: formatGraphMessage(result.graphIssues),
      graph: result.graphIssues,
    };
  }
  return {
    error: "MISSING_REQUIRED_FIELDS",
    message: formatFieldGapMessage(result.fieldGaps),
    nodes: result.fieldGaps,
  };
}
