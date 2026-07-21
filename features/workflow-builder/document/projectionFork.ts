import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { nodeTypeKey } from "@/core/workflows/advancedBranching";
import {
  returnableBranchLabels,
  type BranchWiringIssue,
} from "@/core/workflows/branchWiring";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { MAX_FORK_DEPTH, type ComplexRegionReason } from "./projectionTiers";
import type { DocumentForkBlock, DocumentForkLane } from "./documentModel";
import {
  blankChipsFor,
  forkConditionSummary,
  forkMetaDisplayName,
  laneSubtitle,
  laneTitle,
  providerLabelFor,
} from "./projectionText";
import type { ForkResult, WalkContext } from "./projectionWalk";
import { allPredsVisited, buildComplexRegion, walkSegment } from "./projection";

/**
 * Document Builder — fork (branch) projection (5.DUAL-BUILDER-1 CS-1/CS-2).
 *
 * Split out of `projection.ts` for the 400-line module cap. Owns ONE decision:
 * how an If/Then or Router node becomes readable lanes. Branch semantics come
 * exclusively from `returnableBranchLabels` (node config) + persisted
 * `edge.label` — never positions, handles, or display text. CS-2 keeps a
 * recognized fork readable when wiring is transiently broken, carrying the
 * SHARED `findBranchWiringIssues` message as a lane warning; genuinely
 * ambiguous shapes still refuse into a complex region.
 */

export function walkFork(ctx: WalkContext, node: WorkflowNode, depth: number): ForkResult {
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

  // Same-label fan-out and multiple always edges stay un-narratable — refuse.
  for (const label of vocabulary) {
    if ((byLabel.get(label)?.length ?? 0) > 1) {
      return bailFork(ctx, "parallel_fan_out", id, downstream);
    }
  }
  if (alwaysEdges.length > 1) {
    return bailFork(ctx, "parallel_fan_out", id, downstream);
  }

  // CS-2 — transient missing/stale wiring keeps the fork READABLE: the lane
  // renders with the SHARED finding's plain-language message instead of the
  // whole fork collapsing to a complex region (planning doc §10 risk 5 /
  // CS-1 owner-report follow-up). Structural editing of stale wiring stays a
  // Visual-Builder job; genuinely ambiguous topology still degrades below.
  const wiringIssues = ctx.wiringIssuesByNode.get(id) ?? [];
  const missingByLabel = new Map<string, BranchWiringIssue>();
  const staleByEdgeId = new Map<string, BranchWiringIssue>();
  for (const issue of wiringIssues) {
    if (issue.code === "missing_branch_edge") missingByLabel.set(issue.branchLabel, issue);
    else if (issue.edgeId) staleByEdgeId.set(issue.edgeId, issue);
  }

  const regionStart = ctx.visitOrder.length;
  const lanes: DocumentForkLane[] = [];
  const exits = new Set<string>();
  const typeKey = nodeTypeKey(node);

  interface LanePlan {
    readonly label: string;
    readonly kindHint: "labeled" | "always";
    readonly target: string | null;
    readonly warning: DocumentForkLane["warning"];
    /** Stale lanes render + walk but never vote on the rejoin (dead path). */
    readonly votesOnRejoin: boolean;
    /** CS-2B — the lane's entry edge when it is safe to insert at its start. */
    readonly laneInsert: DocumentForkLane["laneInsert"];
  }
  const laneOrder: LanePlan[] = [
    ...vocabulary.map((label): LanePlan => {
      const edge = byLabel.get(label)?.[0];
      if (!edge) {
        const issue = missingByLabel.get(label);
        return {
          label,
          kindHint: "labeled",
          target: null,
          warning: {
            code: "missing_branch_edge",
            message: issue?.message ?? `Choose where the "${label}" path should continue.`,
          },
          votesOnRejoin: false,
          laneInsert: null,
        };
      }
      return {
        label,
        kindHint: "labeled",
        target: edge.to,
        warning: null,
        votesOnRejoin: true,
        // CS-2B — healthy labeled lane: its entry edge is a safe insertion
        // point (the label is returnable and, per the fan-out guard above,
        // exactly one edge carries it).
        laneInsert: { edgeId: edge.id, fromNodeId: id, toNodeId: edge.to, label },
      };
    }),
    ...[...byLabel.entries()]
      .filter(([label]) => !vocabulary.includes(label))
      .map(([label, staleEdges]): LanePlan[] =>
        staleEdges.map((e): LanePlan => {
          const issue = staleByEdgeId.get(e.id);
          return {
            label,
            kindHint: "labeled",
            target: e.to,
            warning: {
              code: "stale_branch_edge",
              message:
                issue?.message ??
                `This path no longer matches the current routes — review it after changing the condition.`,
            },
            votesOnRejoin: false,
            // Stale routes are dead paths — CS-2B never builds on them.
            laneInsert: null,
          };
        }),
      )
      .flat(),
    ...alwaysEdges.map(
      (e): LanePlan => ({
        label: "",
        kindHint: "always",
        target: e.to,
        warning: null,
        votesOnRejoin: true,
        // Always-run continuations have no route semantics to preserve;
        // placement there stays a Visual-Builder gesture in this slice.
        laneInsert: null,
      }),
    ),
  ];

  for (const lane of laneOrder) {
    const seg = lane.target === null ? null : walkSegment(ctx, lane.target, depth + 1);
    if (seg && seg.exit !== null && lane.votesOnRejoin) exits.add(seg.exit);
    const laneBlocks = seg?.blocks ?? [];
    const lastBlock = laneBlocks[laneBlocks.length - 1];
    lanes.push({
      label: lane.label,
      title: laneTitle(typeKey, lane.label, lane.kindHint, node),
      subtitle: laneSubtitle(typeKey, lane.label, node),
      kindHint: lane.kindHint,
      blocks: laneBlocks,
      terminal:
        seg !== null && seg.exit === null && laneBlocks.length > 0 && lastBlock?.kind !== "complex",
      warning: lane.warning,
      // A lane that degraded into a complex region is not safely insertable.
      laneInsert: lastBlock?.kind === "complex" ? null : lane.laneInsert,
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
