import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { layoutWorkflowGraph } from "./workflowLayout";

/**
 * Pure diff/composition layer for the React Agent preview (HERMES-AGENT-PREVIEW-DIFF-GRAPH).
 *
 * Preview mode is NOT a translucent layer floating over the real graph. It is ONE workflow graph that
 * shows what the workflow will look like AFTER Apply, with changes marked up like a diff. This pure
 * helper composes that single graph from the CURRENT draft + the validated CANDIDATE definition, tags
 * every node/edge with a `diffStatus`, and assigns NON-OVERLAPPING positions so a removed node never
 * stacks on top of its replacement.
 *
 * Diff rules (keyed on stable node ids; the patch engine preserves untouched ids and mints fresh ids
 * for added/replacement nodes, so a Slack→Gmail replacement reads as Slack `removed` + Gmail `added`):
 *   - node in BOTH, same provider:type + config → `unchanged`
 *   - node in BOTH, same provider:type, different config → `changed`
 *   - node in BOTH, DIFFERENT provider:type (a capability swap) → REPLACEMENT: old `removed` + new `added`
 *   - node only in the candidate → `added`
 *   - node only in the current draft → `removed`
 *   - edge matched by (from,to,label) in both → `unchanged`; candidate-only → `added`; current-only → `removed`
 *
 * Capability-swap rule (product rule): a provider:type change is a REPLACEMENT, not an in-place change —
 * the old node must read as `removed` and the new one as `added`, never a single orange `changed` card.
 * Genuine remove+add proposals already do this because the patch engine mints a fresh id for the new
 * node. To stay correct even if a proposal REUSES the old node's id for a different provider:type, the
 * builder re-keys such a candidate node to a synthetic display id first (see `splitReplacedCandidateIds`)
 * so the same id never carries two capabilities. The re-key is presentational only — Apply replaces the
 * draft with `proposedDefinition` verbatim and never sees these synthetic ids. Same provider:type with
 * only config edits keeps the original id and reads as `changed`.
 *
 * Layout: the CANDIDATE graph (unchanged + changed + added) is laid out cleanly via the shared
 * `layoutWorkflowGraph`; REMOVED nodes are placed in a side lane next to the candidate node that took
 * their place (so a replacement reads as "this → that" side by side), else stacked in a removed lane to
 * the right. No node shares another node's position.
 *
 * Pure + deterministic + presentational-input only (provider/type/config/positions) — no store, no
 * network, no secrets beyond what the candidate already carries (the user's own draft).
 */

export type PreviewNodeDiffStatus = "unchanged" | "added" | "removed" | "changed";
export type PreviewEdgeDiffStatus = "unchanged" | "added" | "removed";

export interface PreviewDiffNode extends WorkflowNode {
  readonly diffStatus: PreviewNodeDiffStatus;
}

export interface PreviewDiffEdge extends WorkflowEdge {
  readonly diffStatus: PreviewEdgeDiffStatus;
}

export interface PreviewDiffGraph {
  readonly nodes: readonly PreviewDiffNode[];
  readonly edges: readonly PreviewDiffEdge[];
}

/** Horizontal offset for the "removed" lane so a removed node never overlaps its replacement. */
const REMOVED_LANE_GAP = 360;
/** Vertical step used when more than one removed node would land on the same slot. */
const REMOVED_STACK_GAP = 160;

interface GraphLike {
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
}

/** Stable, key-order-independent serialization of a node's config for change detection. */
function canonicalConfig(config: Record<string, unknown> | undefined): string {
  return JSON.stringify(canonicalize(config ?? {}));
}
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = canonicalize(obj[k]);
    return out;
  }
  return value;
}

/** Edge identity for diffing — endpoints + branch label, NOT the (system-owned) edge id. */
function edgeKey(e: WorkflowEdge): string {
  return `${e.from}->${e.to}::${e.label ?? ""}`;
}

function nodeDiffStatus(current: WorkflowNode | undefined, candidate: WorkflowNode): PreviewNodeDiffStatus {
  if (!current) return "added";
  // A provider:type (capability) swap is a REPLACEMENT, never an in-place change. By the time we get
  // here `splitReplacedCandidateIds` has already re-keyed such candidates so this id pair shares a
  // capability; the guard stays as defense in depth (a stray same-id swap reads as added, then the old
  // node is emitted as removed) rather than collapsing to a misleading orange `changed`.
  if (current.provider !== candidate.provider || current.type !== candidate.type) return "added";
  if (canonicalConfig(current.config) !== canonicalConfig(candidate.config)) return "changed";
  return "unchanged";
}

/**
 * Capability-swap normalization: if the candidate REUSES a current node's id but with a different
 * provider:type, re-key that candidate node (and its incident edges) to a synthetic DISPLAY id so the
 * old id is left only on the current draft. The downstream diff then reads it as the old node `removed`
 * + the new node `added` (two distinct cards/slots) instead of a single `changed` card. Genuine
 * remove+add proposals (fresh candidate id) and same-capability config edits (same id, same
 * provider:type) are returned unchanged. Presentational only — `proposedDefinition` is unaffected.
 */
function splitReplacedCandidateIds(current: GraphLike, candidate: GraphLike): GraphLike {
  const currentById = new Map((current.nodes ?? []).map((n) => [n.id, n]));
  const remap = new Map<string, string>();
  let counter = 0;
  for (const c of candidate.nodes ?? []) {
    const cur = currentById.get(c.id);
    if (cur && (cur.provider !== c.provider || cur.type !== c.type)) {
      remap.set(c.id, `${c.id}::replacement-${counter++}`);
    }
  }
  if (remap.size === 0) return candidate;
  return {
    nodes: (candidate.nodes ?? []).map((n) => (remap.has(n.id) ? { ...n, id: remap.get(n.id)! } : n)),
    edges: (candidate.edges ?? []).map((e) => ({
      ...e,
      from: remap.get(e.from) ?? e.from,
      to: remap.get(e.to) ?? e.to,
    })),
  };
}

/**
 * Compose the single, diff-tagged preview graph from the current draft and the validated candidate.
 * `current` is the live local draft; `candidate` is the proposed end-state (e.g. `proposedDefinition`).
 */
export function buildPreviewDiffGraph(current: GraphLike, candidate: GraphLike): PreviewDiffGraph {
  // Normalize capability swaps that reuse an id so they read as removed+added (not a single `changed`).
  const effectiveCandidate = splitReplacedCandidateIds(current, candidate);
  const currentNodes = current.nodes ?? [];
  const currentEdges = current.edges ?? [];
  const candidateNodes = effectiveCandidate.nodes ?? [];
  const candidateEdges = effectiveCandidate.edges ?? [];

  const currentById = new Map(currentNodes.map((n) => [n.id, n]));
  const candidateById = new Map(candidateNodes.map((n) => [n.id, n]));

  // 1. Lay out the CANDIDATE (the "after" graph) cleanly. These positions anchor the diff graph.
  const laidOutCandidate = layoutWorkflowGraph([...candidateNodes], [...candidateEdges]);
  const candidatePosById = new Map(laidOutCandidate.map((n) => [n.id, n.position]));

  const diffNodes: PreviewDiffNode[] = laidOutCandidate.map((n) => ({
    ...n,
    diffStatus: nodeDiffStatus(currentById.get(n.id), n),
  }));

  // 2. Place REMOVED nodes (current-only) in a side lane, aligned to their replacement when detectable.
  const removed = currentNodes.filter((n) => !candidateById.has(n.id));
  const removedLaneX =
    (laidOutCandidate.length > 0 ? Math.max(...laidOutCandidate.map((n) => n.position.x)) : 0) + REMOVED_LANE_GAP;
  const usedSlots = new Set<string>();
  for (const r of removed) {
    const replacementPos = findReplacementPosition(r, currentEdges, candidateEdges, candidatePosById, candidateById);
    let pos = replacementPos
      ? { x: replacementPos.x + REMOVED_LANE_GAP, y: replacementPos.y }
      : { x: removedLaneX, y: 0 };
    // Avoid two removed nodes colliding on the same slot — step down until clear.
    while (usedSlots.has(`${Math.round(pos.x)}:${Math.round(pos.y)}`)) {
      pos = { x: pos.x, y: pos.y + REMOVED_STACK_GAP };
    }
    usedSlots.add(`${Math.round(pos.x)}:${Math.round(pos.y)}`);
    diffNodes.push({ ...r, position: pos, diffStatus: "removed" });
  }

  // 3. Edges: candidate edges are unchanged/added; current-only edges are removed.
  const candidateEdgeKeys = new Set(candidateEdges.map(edgeKey));
  const currentEdgeKeys = new Set(currentEdges.map(edgeKey));
  const diffEdges: PreviewDiffEdge[] = [];
  for (const e of candidateEdges) {
    diffEdges.push({ ...e, diffStatus: currentEdgeKeys.has(edgeKey(e)) ? "unchanged" : "added" });
  }
  for (const e of currentEdges) {
    if (!candidateEdgeKeys.has(edgeKey(e))) diffEdges.push({ ...e, diffStatus: "removed" });
  }

  return { nodes: diffNodes, edges: diffEdges };
}

/**
 * For a removed node R, find the position of the candidate node that took its place: the candidate node
 * its parent now points to (parent P with edge P→R in current, and edge P→A in candidate, A ≠ R and A
 * not also removed). Returns that candidate position, or null when there's no clear 1:1 replacement.
 */
function findReplacementPosition(
  removedNode: WorkflowNode,
  currentEdges: readonly WorkflowEdge[],
  candidateEdges: readonly WorkflowEdge[],
  candidatePosById: ReadonlyMap<string, { x: number; y: number }>,
  candidateById: ReadonlyMap<string, WorkflowNode>,
): { x: number; y: number } | null {
  const parents = currentEdges.filter((e) => e.to === removedNode.id).map((e) => e.from);
  for (const parent of parents) {
    if (!candidateById.has(parent)) continue; // parent itself was removed → no stable anchor
    const replacement = candidateEdges.find((e) => e.from === parent && e.to !== removedNode.id);
    if (replacement) {
      const pos = candidatePosById.get(replacement.to);
      if (pos) return pos;
    }
  }
  return null;
}
