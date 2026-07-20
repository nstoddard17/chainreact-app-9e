import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { isAdvancedBranchingNode, nodeTypeKey } from "@/core/workflows/advancedBranching";
import { returnableBranchLabels } from "@/core/workflows/branchWiring";
import {
  MAX_FORK_DEPTH,
  TIER_C_REASONS,
  complexRegionMessage,
  findCycle,
  type ComplexRegionReason,
} from "./projectionTiers";
import type {
  DocumentBlock,
  DocumentForkBlock,
  DocumentForkLane,
  DocumentModel,
  DocumentProjectionInput,
  ProjectionMeta,
  ProjectionWarning,
} from "./documentModel";
import {
  blankChipsFor,
  complexBlock,
  forkConditionSummary,
  forkMetaDisplayName,
  laneSubtitle,
  laneTitle,
  providerLabelFor,
  sentenceBlocksFor,
} from "./projectionText";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";

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

interface WalkContext {
  readonly byId: ReadonlyMap<string, WorkflowNode>;
  readonly outgoing: ReadonlyMap<string, WorkflowEdge[]>;
  readonly indegree: ReadonlyMap<string, number>;
  readonly visited: Set<string>;
  readonly visitOrder: string[];
  readonly meta: ProjectionMeta;
}

interface SegmentResult {
  readonly blocks: DocumentBlock[];
  /**
   * The join node this segment stopped BEFORE (not emitted, not visited) —
   * bubbled up so the enclosing fork can prove a single rejoin. Null when the
   * segment is terminal (path ends or degraded into a complex region).
   */
  readonly exit: string | null;
}

function allPredsVisited(ctx: WalkContext, nodeId: string): boolean {
  for (const [from, bucket] of ctx.outgoing) {
    if (ctx.visited.has(from)) continue;
    for (const e of bucket) {
      if (e.to === nodeId) return false;
    }
  }
  return true;
}

function walkSegment(ctx: WalkContext, startId: string, depth: number): SegmentResult {
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

    blocks.push(...sentenceBlocksFor(ctx.meta, ctx.byId, node));

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

interface ForkResult {
  readonly blocks: DocumentBlock[];
  /** Rejoin node to continue the enclosing segment at (proven safe to visit next). */
  readonly continueAt: string | null;
  /** Bubbled join when the rejoin belongs to an enclosing fork. */
  readonly exit: string | null;
}

function walkFork(ctx: WalkContext, node: WorkflowNode, depth: number): ForkResult {
  const id = node.id;
  const out = ctx.outgoing.get(id) ?? [];
  const downstream = out.map((e) => e.to);

  if (depth + 1 > MAX_FORK_DEPTH) {
    return bailFork(ctx, "nesting_too_deep", id, downstream);
  }

  const vocabulary = returnableBranchLabels(node);
  if (vocabulary === null) {
    // Unconfigured / malformed Router — routes validation owns this state.
    return bailFork(ctx, "branch_config_invalid", id, downstream);
  }

  const byLabel = new Map<string, WorkflowEdge[]>();
  const alwaysEdges: WorkflowEdge[] = [];
  for (const e of out) {
    if (e.label === undefined) {
      alwaysEdges.push(e);
      continue;
    }
    const bucket = byLabel.get(e.label);
    if (bucket) bucket.push(e);
    else byLabel.set(e.label, [e]);
  }

  // Wiring must match the engine's activation exactly: every returnable label
  // wired once, no stale labels, at most one always edge, no same-label fan-out.
  for (const label of vocabulary) {
    if ((byLabel.get(label)?.length ?? 0) !== 1) {
      return bailFork(ctx, "branch_wiring", id, downstream);
    }
  }
  for (const label of byLabel.keys()) {
    if (!vocabulary.includes(label)) {
      return bailFork(ctx, "branch_wiring", id, downstream);
    }
  }
  if (alwaysEdges.length > 1) {
    return bailFork(ctx, "parallel_fan_out", id, downstream);
  }

  const regionStart = ctx.visitOrder.length;
  const lanes: DocumentForkLane[] = [];
  const exits = new Set<string>();
  const typeKey = nodeTypeKey(node);

  const laneOrder: Array<{ label: string; kindHint: "labeled" | "always"; target: string }> = [
    ...vocabulary.map((label) => ({
      label,
      kindHint: "labeled" as const,
      target: byLabel.get(label)![0]!.to,
    })),
    ...alwaysEdges.map((e) => ({ label: "", kindHint: "always" as const, target: e.to })),
  ];

  for (const lane of laneOrder) {
    const seg = walkSegment(ctx, lane.target, depth + 1);
    if (seg.exit !== null) exits.add(seg.exit);
    const lastBlock = seg.blocks[seg.blocks.length - 1];
    lanes.push({
      label: lane.label,
      title: laneTitle(typeKey, lane.label, lane.kindHint, node),
      subtitle: laneSubtitle(typeKey, lane.label, node),
      kindHint: lane.kindHint,
      blocks: seg.blocks,
      terminal: seg.exit === null && lastBlock?.kind !== "complex",
    });
  }

  if (exits.size > 1) {
    // Lanes converge in more than one place — un-emittable as one rejoin.
    // The lanes' nodes were already visited; the whole fork region degrades.
    const regionIds = [id, ...ctx.visitOrder.slice(regionStart)];
    const block = buildComplexRegion(ctx, "ambiguous_rejoin", regionIds, [...exits]);
    return { blocks: [block], continueAt: null, exit: null };
  }

  const rejoin = exits.size === 1 ? [...exits][0]! : null;
  const forkBlock: DocumentForkBlock = {
    kind: "fork",
    nodeId: id,
    title: getNodeDisplayName(node, forkMetaDisplayName(ctx.meta, node)),
    providerId: node.provider,
    providerLabel: providerLabelFor(ctx.meta, node.provider),
    conditionSummary: forkConditionSummary(node, vocabulary),
    blankChips: blankChipsFor(ctx.meta, node),
    lanes,
    rejoinNodeId: rejoin,
    depth,
  };

  if (rejoin === null) {
    return { blocks: [forkBlock], continueAt: null, exit: null };
  }
  if (!allPredsVisited(ctx, rejoin)) {
    // The rejoin belongs to an enclosing fork — bubble it up unresolved.
    return { blocks: [forkBlock], continueAt: null, exit: rejoin };
  }
  return { blocks: [forkBlock], continueAt: rejoin, exit: null };
}

function bailFork(
  ctx: WalkContext,
  reason: ComplexRegionReason,
  forkId: string,
  downstream: readonly string[],
): ForkResult {
  return {
    blocks: [buildComplexRegion(ctx, reason, [forkId], downstream)],
    continueAt: null,
    exit: null,
  };
}

/**
 * Collect `include` plus every not-yet-visited node reachable from `seeds`
 * (edge-array-order DFS), mark them visited, and build the region block.
 */
function buildComplexRegion(
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
