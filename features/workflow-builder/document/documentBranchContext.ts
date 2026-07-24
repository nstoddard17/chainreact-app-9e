import type {
  DocumentBlock,
  DocumentForkBlock,
  DocumentForkLane,
  DocumentModel,
} from "./documentModel";

/**
 * Document Builder — lane-aware branch context (5.DUAL-BUILDER-1 / CS-5).
 *
 * Pure, React-free, store-free derivations over the already-computed
 * `DocumentModel` (never the raw graph — so lane identity comes ONLY from the
 * projection's `edge.label`-derived lanes, never canvas position or handles).
 *
 * Provides the reader-facing NAVIGATION layer the Guided Stops need when a value
 * lives inside a branch lane:
 *   - `buildLaneContext` — the breadcrumb ancestry ("Qualify & route › Hot lead
 *     › Enterprise") plus the sibling lanes of the innermost enclosing fork, for
 *     lane-switch chips.
 *   - `findForkBlock` — locate a rendered fork by node id (depth checks / edit).
 *
 * Navigation is FOCUS ONLY: nothing here mutates config, edges, or topology —
 * switching a lane changes what the reader looks at, never what runs (planning
 * doc CS-5: "Lane switching never changes route config or graph topology").
 */

/** One breadcrumb step: the enclosing fork + the lane taken into it. */
export interface LaneCrumb {
  readonly forkNodeId: string;
  readonly forkTitle: string;
  /** The persisted edge label of the lane ("" for the always lane). */
  readonly laneLabel: string;
  readonly laneTitle: string;
}

/** A sibling lane of the innermost enclosing fork (for lane-switch chips). */
export interface SiblingLane {
  readonly forkNodeId: string;
  readonly label: string;
  readonly title: string;
  readonly kindHint: "labeled" | "always";
  /** True when this is the lane currently in focus. */
  readonly active: boolean;
  /** First executable node in the lane (scroll/focus target), when any. */
  readonly firstNodeId: string | null;
  readonly terminal: boolean;
  readonly hasWarning: boolean;
}

export interface DocumentLaneContext {
  readonly nodeId: string;
  /** Outermost → innermost enclosing forks/lanes. Empty for a top-level node. */
  readonly breadcrumb: readonly LaneCrumb[];
  /** The innermost enclosing fork, when the node is inside a lane. */
  readonly forkNodeId: string | null;
  readonly laneLabel: string | null;
  readonly laneTitle: string | null;
  /** Sibling lanes of the innermost enclosing fork (includes the active one). */
  readonly siblings: readonly SiblingLane[];
  /** Depth of the innermost enclosing fork (null for a top-level node). */
  readonly depth: number | null;
}

/** The first executable node id reachable in document order within `blocks`. */
export function firstNodeIdOfBlocks(blocks: readonly DocumentBlock[]): string | null {
  for (const block of blocks) {
    if (block.kind === "sentence" || block.kind === "fork") return block.nodeId;
    if (block.kind === "complex" && block.nodeIds.length > 0) return block.nodeIds[0]!;
  }
  return null;
}

function siblingLanesOf(fork: DocumentForkBlock, activeLabel: string | null): SiblingLane[] {
  return fork.lanes.map((lane: DocumentForkLane): SiblingLane => ({
    forkNodeId: fork.nodeId,
    label: lane.label,
    title: lane.title,
    kindHint: lane.kindHint,
    active: activeLabel !== null && lane.label === activeLabel,
    firstNodeId: firstNodeIdOfBlocks(lane.blocks),
    terminal: lane.terminal,
    hasWarning: lane.warning !== null,
  }));
}

interface SearchHit {
  readonly crumbs: readonly LaneCrumb[];
  /** The innermost enclosing fork block (null when the node is top-level). */
  readonly innerFork: DocumentForkBlock | null;
  /** The lane label the node sits directly inside (null at top level). */
  readonly laneLabel: string | null;
  readonly laneTitle: string | null;
}

function search(
  blocks: readonly DocumentBlock[],
  nodeId: string,
  crumbs: readonly LaneCrumb[],
  innerFork: DocumentForkBlock | null,
  laneLabel: string | null,
  laneTitle: string | null,
): SearchHit | null {
  for (const block of blocks) {
    if (block.kind === "sentence") {
      if (block.nodeId === nodeId) return { crumbs, innerFork, laneLabel, laneTitle };
      continue;
    }
    if (block.kind === "complex") {
      if (block.nodeIds.includes(nodeId)) return { crumbs, innerFork, laneLabel, laneTitle };
      continue;
    }
    // fork
    if (block.nodeId === nodeId) {
      // The fork header itself: its context is the lane it LIVES in (the
      // current enclosing lane), not its own lanes.
      return { crumbs, innerFork, laneLabel, laneTitle };
    }
    for (const lane of block.lanes) {
      const nextCrumbs: LaneCrumb[] = [
        ...crumbs,
        {
          forkNodeId: block.nodeId,
          forkTitle: block.title,
          laneLabel: lane.label,
          laneTitle: lane.title,
        },
      ];
      const hit = search(lane.blocks, nodeId, nextCrumbs, block, lane.label, lane.title);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * The lane context of `nodeId` within the projected document. Returns null only
 * when the node is not present in the model at all (stale id). A top-level node
 * returns an empty breadcrumb and no siblings.
 */
export function buildLaneContext(
  model: DocumentModel,
  nodeId: string,
): DocumentLaneContext | null {
  const hit = search(model.blocks, nodeId, [], null, null, null);
  if (!hit) return null;
  return {
    nodeId,
    breadcrumb: hit.crumbs,
    forkNodeId: hit.innerFork?.nodeId ?? null,
    laneLabel: hit.laneLabel,
    laneTitle: hit.laneTitle,
    siblings: hit.innerFork ? siblingLanesOf(hit.innerFork, hit.laneLabel) : [],
    depth: hit.innerFork?.depth ?? null,
  };
}

/** Locate a rendered fork block by its node id (recursing into nested lanes). */
export function findForkBlock(
  model: DocumentModel,
  forkNodeId: string,
): DocumentForkBlock | null {
  const visit = (blocks: readonly DocumentBlock[]): DocumentForkBlock | null => {
    for (const block of blocks) {
      if (block.kind !== "fork") continue;
      if (block.nodeId === forkNodeId) return block;
      for (const lane of block.lanes) {
        const found = visit(lane.blocks);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(model.blocks);
}
