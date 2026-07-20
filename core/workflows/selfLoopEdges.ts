import type { WorkflowEdge } from "@/contracts/workflow";

/**
 * Pure detector for SELF-LOOP edges — a connection whose `from` and `to` are the
 * SAME node (a step wired to itself) (Slice 4.AI-REPAIR-COVERAGE-1).
 *
 * Originally a DIAGNOSIS-only helper (this slice deliberately did not touch
 * `runnable`/Activate). Since then, self-loop detection was ALSO promoted into the
 * shared runtime validator `core/workflows/executionReadiness.ts:findGraphIssues`
 * (`self_loop_edge`), which gates the engine pre-dispatch, run-now preflight, and
 * the Activate gate. This module remains the Check-level detector used by
 * diagnosis/repair, which needs the edge/node ids for the `removeEdge` proposal.
 *
 * The patch validator already classifies a self-loop as `INVALID_EDGE`, so the safe
 * deterministic repair (`removeEdge`) is unambiguous: an edge from a step to itself
 * is never valid, and removing it can never disconnect anything else.
 *
 * Pure: no I/O, no registry, no model.
 */

export interface SelfLoopEdge {
  /** Internal edge id (the `removeEdge` target). Never rendered to users. */
  readonly edgeId: string;
  /** The node the edge loops on (== `from` == `to`). Internal id — never rendered. */
  readonly nodeId: string;
}

/** Return every self-loop edge (`from === to`) in source order. Empty when none. */
export function findSelfLoopEdges(
  edges: readonly WorkflowEdge[],
): SelfLoopEdge[] {
  const out: SelfLoopEdge[] = [];
  for (const edge of edges) {
    if (edge.from === edge.to) {
      out.push({ edgeId: edge.id, nodeId: edge.from });
    }
  }
  return out;
}
