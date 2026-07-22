import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflow";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import type { DocumentModel, ProjectionMeta } from "./documentModel";
import { projectDefinitionToDocument } from "./projection";

/**
 * Document Builder — pure React-Agent PREVIEW projection (5.DUAL-BUILDER-1 / CS-6).
 *
 * Turns the EXISTING agent response shapes into a read-only ghost Document. It is
 * a PROJECTION, never a mutation: it reads the live graph + the ephemeral preview
 * overlay (owned by `useBuilderPreview`) and returns a display model. It never
 * touches graphSlice/configSlice, never marks dirty, never calls save — the
 * canonical Apply path (`applyAdditivePatch` / `replaceGraphLocal`) stays the ONLY
 * way a proposal becomes real (planning doc §6.2 / CS-6 rules).
 *
 * Two shapes, matching the two existing apply paths:
 *   - ADDITIVE (new-workflow plan, no `proposedDefinition`): render the display
 *     `DraftPreview` nodes as ghost sentences in sequence. These carry PREVIEW ids
 *     (`previewId`), never real node ids — nothing is inserted into graphSlice to
 *     render them.
 *   - EDIT (a `proposedDefinition` end-state): project that definition read-only
 *     and tag every node `added` / `modified` / `unchanged` vs the live draft, plus
 *     the `removed` nodes (live but not proposed). When the proposed graph can't be
 *     read as prose at all (Tier C), flag a Visual-Builder handoff.
 *
 * Pure: no React, no store, no fetch (locked by the document-builder structure test).
 */

export type PreviewNodeStatus = "added" | "modified" | "unchanged";

/** A ghost step in an ADDITIVE preview (preview identity, never a real node id). */
export interface GhostSentence {
  readonly previewId: string;
  readonly title: string;
  readonly provider: string;
  readonly type: string;
  readonly purpose: string;
  readonly missingInputs: readonly string[];
}

export interface RemovedNodeRef {
  readonly nodeId: string;
  readonly title: string;
}

export interface DocumentPreviewModel {
  readonly kind: "additive" | "edit" | "empty";
  readonly title: string;
  readonly summary: string;
  readonly warnings: readonly string[];
  /** ADDITIVE — ghost steps in document order. */
  readonly ghosts: readonly GhostSentence[];
  /** EDIT — the projected proposed Document (read-only). */
  readonly proposedModel: DocumentModel | null;
  /** EDIT — per proposed-node change status vs the live draft. */
  readonly statusByNodeId: ReadonlyMap<string, PreviewNodeStatus>;
  /** EDIT — nodes in the live draft the proposal removes. */
  readonly removed: readonly RemovedNodeRef[];
  /** EDIT — the whole proposed graph can't render as prose (Tier C) → Visual handoff. */
  readonly needsVisualReview: boolean;
}

export interface DocumentPreviewInput {
  readonly liveNodes: readonly WorkflowNode[];
  readonly liveEdges: readonly WorkflowEdge[];
  readonly preview: DraftPreview;
  readonly proposedDefinition?: WorkflowDefinition | undefined;
  readonly meta?: ProjectionMeta | undefined;
}

/** Order the display-preview nodes by following the preview edge sequence. */
function orderAdditiveGhosts(preview: DraftPreview): GhostSentence[] {
  const byId = new Map(preview.nodes.map((n) => [n.previewId, n]));
  const nextOf = new Map<string, string>();
  const hasIncoming = new Set<string>();
  for (const e of preview.edges) {
    if (!nextOf.has(e.fromPreviewId)) nextOf.set(e.fromPreviewId, e.toPreviewId);
    hasIncoming.add(e.toPreviewId);
  }
  // Start at the first node with no incoming preview edge (node-array order tiebreak).
  const start = preview.nodes.find((n) => !hasIncoming.has(n.previewId)) ?? preview.nodes[0];
  const ordered: GhostSentence[] = [];
  const seen = new Set<string>();
  let cur = start?.previewId;
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    const n = byId.get(cur)!;
    ordered.push({
      previewId: n.previewId,
      title: n.label,
      provider: n.provider,
      type: n.type,
      purpose: n.purpose,
      missingInputs: n.missingInputs ?? [],
    });
    cur = nextOf.get(cur);
  }
  // Any nodes not reached by the sequence (defensive) are appended in array order.
  for (const n of preview.nodes) {
    if (seen.has(n.previewId)) continue;
    ordered.push({
      previewId: n.previewId,
      title: n.label,
      provider: n.provider,
      type: n.type,
      purpose: n.purpose,
      missingInputs: n.missingInputs ?? [],
    });
  }
  return ordered;
}

function sameConfig(a: WorkflowNode, b: WorkflowNode): boolean {
  if (a.provider !== b.provider || a.type !== b.type) return false;
  return JSON.stringify(a.config ?? {}) === JSON.stringify(b.config ?? {});
}

export function buildDocumentPreview(input: DocumentPreviewInput): DocumentPreviewModel {
  const base = {
    title: input.preview.title,
    summary: input.preview.summary,
    warnings: input.preview.warnings ?? [],
  };

  // ---- EDIT path: a full proposed end-state graph ----------------------------
  if (input.proposedDefinition) {
    const proposed = input.proposedDefinition;
    const proposedModel = projectDefinitionToDocument({
      nodes: proposed.nodes,
      edges: proposed.edges,
      ...(input.meta ?? {}),
    });
    const liveById = new Map(input.liveNodes.map((n) => [n.id, n]));
    const proposedIds = new Set(proposed.nodes.map((n) => n.id));
    const statusByNodeId = new Map<string, PreviewNodeStatus>();
    for (const node of proposed.nodes) {
      const live = liveById.get(node.id);
      if (!live) statusByNodeId.set(node.id, "added");
      else if (!sameConfig(live, node)) statusByNodeId.set(node.id, "modified");
      else statusByNodeId.set(node.id, "unchanged");
    }
    const removed: RemovedNodeRef[] = input.liveNodes
      .filter((n) => !proposedIds.has(n.id))
      .map((n) => ({ nodeId: n.id, title: getNodeDisplayName(n, undefined) }));
    return {
      kind: "edit",
      ...base,
      ghosts: [],
      proposedModel,
      statusByNodeId,
      removed,
      // A whole-graph fallback (cycle / multiple triggers) can't be read as prose.
      needsVisualReview: proposedModel.tier === "C",
    };
  }

  // ---- ADDITIVE path: the display DraftPreview ------------------------------
  const ghosts = orderAdditiveGhosts(input.preview);
  return {
    kind: ghosts.length === 0 ? "empty" : "additive",
    ...base,
    ghosts,
    proposedModel: null,
    statusByNodeId: new Map(),
    removed: [],
    needsVisualReview: false,
  };
}
