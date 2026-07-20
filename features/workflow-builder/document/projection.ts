import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { isAdvancedBranchingNode } from "@/core/workflows/advancedBranching";
import { findBranchWiringIssues, type BranchWiringIssue } from "@/core/workflows/branchWiring";
import {
  TIER_C_REASONS,
  complexRegionMessage,
  findCycle,
  type ComplexRegionReason,
} from "./projectionTiers";
import type {
  DocumentBlock,
  DocumentModel,
  DocumentProjectionInput,
  ProjectionMeta,
  ProjectionWarning,
} from "./documentModel";
import { complexBlock, sentenceBlocksFor } from "./projectionText";
import { walkFork } from "./projectionFork";
import type { SegmentResult, WalkContext } from "./projectionWalk";

/**
 * Document Builder — pure graph→Document projection (5.DUAL-BUILDER-1 / CS-1).
 *
 * Derives an in-memory `DocumentModel` from the canonical draft graph
 * (`graphSlice.pendingNodes` / `pendingEdges`) plus the SAME server-provided
 * metadata the canvas already uses. The model is recomputed on every store
 * change and NEVER persisted (planning doc §4: "two editors, one workflow").
 *
 * Invariants (locked by tests/unit/features/workflow-builder/document/):
 *   - deterministic: same input → same output. Tie-breaks are documented:
 *     traversal follows EDGE ARRAY ORDER for a node's outgoing edges, NODE
 *     ARRAY ORDER for root selection and unvisited sweeps, and the node's
 *     returnable-label VOCABULARY ORDER (`returnableBranchLabels`) for lanes.
 *   - total + non-throwing for any WorkflowDefinition-shaped in-memory graph;
 *     unsupported shapes degrade to honest complex regions (projectionTiers),
 *     never guessed prose and never a rewrite.
 *   - non-mutating: inputs are read-only and untouched.
 *   - every node appears exactly once — as a sentence, inside a fork lane, as
 *     a fork header, or listed in a complex/fallback region. No node silently
 *     disappears; rejoin nodes are never duplicated.
 *   - branch semantics come ONLY from node provider/type/config
 *     (`returnableBranchLabels`) + persisted `edge.label`; never positions,
 *     handles, or display text.
 */

// Re-exported so callers/tests can import the whole surface from one module.
export type {
  DocumentBlock,
  DocumentBlankChip,
  DocumentComplexRegionBlock,
  DocumentForkBlock,
  DocumentForkLane,
  DocumentModel,
  DocumentProjectionInput,
  DocumentSentenceBlock,
  DocumentValueChip,
  ProjectionWarning,
} from "./documentModel";

export function projectDefinitionToDocument(
  input: DocumentProjectionInput,
): DocumentModel {
  try {
    return projectInner(input);
  } catch {
    // Total-function backstop: the projection must never crash the builder.
    // Anything unexpected degrades to a whole-graph fallback region.
    const nodes = dedupeNodes(input.nodes ?? []);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return {
      empty: nodes.length === 0,
      tier: "C",
      blocks:
        nodes.length === 0
          ? []
          : [complexBlock("cycle", nodes.map((n) => n.id), byId, undefined)],
      warnings: [
        {
          code: "region_degraded",
          message: "The Document could not read this workflow safely.",
        },
      ],
      nodeCount: nodes.length,
    };
  }
}

function dedupeNodes(nodes: readonly WorkflowNode[]): WorkflowNode[] {
  const seen = new Set<string>();
  const out: WorkflowNode[] = [];
  for (const n of nodes) {
    if (!n || typeof n.id !== "string" || n.id === "" || seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
}

function projectInner(input: DocumentProjectionInput): DocumentModel {
  const warnings: ProjectionWarning[] = [];
  const rawNodes = input.nodes ?? [];
  const nodes = dedupeNodes(rawNodes);
  if (nodes.length !== rawNodes.length) {
    warnings.push({
      code: "duplicate_node_id",
      message: "Some steps had duplicate or invalid ids and were merged for display.",
    });
  }
  if (nodes.length === 0) {
    return { empty: true, tier: "A", blocks: [], warnings, nodeCount: 0 };
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Valid edges only: both endpoints exist. (Self-loops survive to the cycle
  // check, which classifies them Tier C.)
  const edges: WorkflowEdge[] = [];
  for (const e of input.edges ?? []) {
    if (!e || !byId.has(e.from) || !byId.has(e.to)) {
      warnings.push({
        code: "invalid_edge_skipped",
        message: "A connection pointing at a missing step was ignored.",
      });
      continue;
    }
    edges.push(e);
  }

  const meta: ProjectionMeta = {
    requiredFieldsByType: input.requiredFieldsByType,
    summaryFieldsByType: input.summaryFieldsByType,
    providerLabels: input.providerLabels,
  };

  // ---- Tier C whole-graph checks -------------------------------------------
  const triggers = nodes.filter((n) => n.kind === "trigger");
  if (triggers.length > 1) {
    return tierCFallback("multiple_triggers", nodes, byId, meta, warnings);
  }
  if (findCycle(nodes, edges) !== null) {
    return tierCFallback("cycle", nodes, byId, meta, warnings);
  }

  // ---- traversal indexes ----------------------------------------------------
  const outgoing = new Map<string, WorkflowEdge[]>();
  const indegree = new Map<string, number>();
  for (const n of nodes) indegree.set(n.id, 0);
  for (const e of edges) {
    const bucket = outgoing.get(e.from);
    if (bucket) bucket.push(e);
    else outgoing.set(e.from, [e]);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }

  // Root: the trigger; otherwise the FIRST source node in node-array order
  // (documented tie-break) with a "no trigger" warning.
  let root: string;
  if (triggers.length === 1) {
    root = triggers[0]!.id;
  } else {
    warnings.push({
      code: "no_trigger",
      message: "This workflow has no trigger yet — it starts from its first step.",
    });
    const source = nodes.find((n) => (indegree.get(n.id) ?? 0) === 0);
    // Acyclic + non-empty ⇒ a source exists; defensive fallback to first node.
    root = (source ?? nodes[0]!).id;
  }

  const ctx: WalkContext = {
    byId,
    outgoing,
    indegree,
    visited: new Set<string>(),
    visitOrder: [],
    meta,
    // CS-2 — the SHARED branch-wiring findings (same vocabulary + messages the
    // validation drawer shows), grouped per node for fork warning lanes.
    wiringIssuesByNode: groupWiringIssues(findBranchWiringIssues(nodes, edges)),
  };

  const main = walkSegment(ctx, root, 0);
  const blocks: DocumentBlock[] = [...main.blocks];

  // A top-level exit means the main path ran into a join fed by nodes we never
  // reached inside a fork — a cross-link the prose can't express.
  if (main.exit !== null && !ctx.visited.has(main.exit)) {
    blocks.push(buildComplexRegion(ctx, "cross_lane", [], [main.exit]));
  }

  // Sweep: anything not reached from the root is honestly listed, never dropped.
  const unreached = nodes.filter((n) => !ctx.visited.has(n.id)).map((n) => n.id);
  if (unreached.length > 0) {
    for (const id of unreached) ctx.visited.add(id);
    blocks.push(complexBlock("disconnected", unreached, byId, meta.summaryFieldsByType));
  }

  const hasComplex = containsComplexBlock(blocks);
  if (hasComplex) {
    warnings.push({
      code: "region_degraded",
      message: "Part of this workflow is shown as a read-only region.",
    });
  }

  return {
    empty: false,
    tier: hasComplex ? "B" : "A",
    blocks,
    warnings,
    nodeCount: nodes.length,
  };
}

/** True when any block — including inside fork lanes — is a complex region. */
function containsComplexBlock(blocks: readonly DocumentBlock[]): boolean {
  for (const block of blocks) {
    if (block.kind === "complex") return true;
    if (block.kind === "fork" && block.lanes.some((l) => containsComplexBlock(l.blocks))) {
      return true;
    }
  }
  return false;
}

function groupWiringIssues(
  issues: readonly BranchWiringIssue[],
): ReadonlyMap<string, readonly BranchWiringIssue[]> {
  const map = new Map<string, BranchWiringIssue[]>();
  for (const issue of issues) {
    const bucket = map.get(issue.nodeId);
    if (bucket) bucket.push(issue);
    else map.set(issue.nodeId, [issue]);
  }
  return map;
}

export function allPredsVisited(ctx: WalkContext, nodeId: string): boolean {
  for (const [from, bucket] of ctx.outgoing) {
    if (ctx.visited.has(from)) continue;
    for (const e of bucket) {
      if (e.to === nodeId) return false;
    }
  }
  return true;
}

export function walkSegment(ctx: WalkContext, startId: string, depth: number): SegmentResult {
  const blocks: DocumentBlock[] = [];
  let cur: string | null = startId;
  // A join node a just-emitted fork PROVED as its single rejoin — the one
  // case a segment may step onto an indegree>1 node. Consumed on use.
  let approvedJoin: string | null = null;

  while (cur !== null) {
    // Join rule: stop BEFORE any node with more than one incoming edge unless
    // an enclosing fork just proved it as the rejoin. This is what keeps a
    // rejoin from being emitted inside the first lane that happens to reach
    // it — the fork emits it exactly once, after ALL lanes are walked.
    if ((ctx.indegree.get(cur) ?? 0) > 1 && cur !== approvedJoin) {
      return { blocks, exit: cur };
    }
    approvedJoin = null;
    if (ctx.visited.has(cur)) {
      // Defensive (unreachable in an acyclic graph with the join rule above):
      // never emit twice — degrade honestly instead.
      blocks.push(buildComplexRegion(ctx, "cross_lane", [], [cur]));
      return { blocks, exit: null };
    }

    const node = ctx.byId.get(cur);
    if (!node) return { blocks, exit: null };
    ctx.visited.add(cur);
    ctx.visitOrder.push(cur);

    if (isAdvancedBranchingNode(node)) {
      const fork = walkFork(ctx, node, depth);
      blocks.push(...fork.blocks);
      if (fork.continueAt === null) return { blocks, exit: fork.exit };
      cur = fork.continueAt;
      approvedJoin = fork.continueAt;
      continue;
    }

    const out: readonly WorkflowEdge[] = ctx.outgoing.get(cur) ?? [];
    const labeled = out.filter((e) => e.label !== undefined);
    if (labeled.length > 0) {
      // Route labels on a non-splitting step — semantics the Document can't
      // read. The step itself joins the region (its labels ARE the problem).
      blocks.push(
        buildComplexRegion(ctx, "labeled_edge_non_branching", [cur], out.map((e) => e.to)),
      );
      return { blocks, exit: null };
    }

    // CS-2 — safe manual-insertion metadata: a single unlabeled outgoing edge
    // is the only unambiguous "insert between" shape; no outgoing edge is the
    // only unambiguous "add at end" anchor.
    const single = out.length === 1 && out[0]!.label === undefined ? out[0]! : null;
    blocks.push(
      ...sentenceBlocksFor(ctx.meta, ctx.byId, node, {
        insertAfter: single ? { edgeId: single.id, toNodeId: single.to } : null,
        isLinearTail: out.length === 0,
      }),
    );

    if (out.length === 0) return { blocks, exit: null };
    if (out.length > 1) {
      // Parallel fan-out from a non-branching step (all-run semantics) —
      // rendered honestly as a region, not guessed into lanes.
      blocks.push(buildComplexRegion(ctx, "parallel_fan_out", [], out.map((e) => e.to)));
      return { blocks, exit: null };
    }
    cur = out[0]!.to;
  }
  return { blocks, exit: null };
}

export function buildComplexRegion(
  ctx: WalkContext,
  reason: ComplexRegionReason,
  include: readonly string[],
  seeds: readonly string[],
) {
  const ids: string[] = [];
  const pushId = (nodeId: string) => {
    if (!ids.includes(nodeId)) ids.push(nodeId);
  };
  for (const nodeId of include) pushId(nodeId);
  const stack = [...seeds].reverse();
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (!ctx.byId.has(nodeId)) continue;
    if (ctx.visited.has(nodeId) && !include.includes(nodeId)) {
      // Already told elsewhere — a region never re-claims an emitted node.
      continue;
    }
    if (!ctx.visited.has(nodeId)) {
      ctx.visited.add(nodeId);
      ctx.visitOrder.push(nodeId);
    }
    pushId(nodeId);
    const out = ctx.outgoing.get(nodeId) ?? [];
    for (let i = out.length - 1; i >= 0; i--) stack.push(out[i]!.to);
  }
  return complexBlock(reason, ids, ctx.byId, ctx.meta.summaryFieldsByType);
}

function tierCFallback(
  reason: ComplexRegionReason,
  nodes: readonly WorkflowNode[],
  byId: ReadonlyMap<string, WorkflowNode>,
  meta: ProjectionMeta,
  warnings: ProjectionWarning[],
): DocumentModel {
  warnings.push({ code: "region_degraded", message: complexRegionMessage(reason) });
  return {
    empty: false,
    tier: TIER_C_REASONS.has(reason) ? "C" : "B",
    blocks: [complexBlock(reason, nodes.map((n) => n.id), byId, meta.summaryFieldsByType)],
    warnings,
    nodeCount: nodes.length,
  };
}
