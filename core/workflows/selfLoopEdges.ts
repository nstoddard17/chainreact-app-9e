import type { WorkflowEdge } from "@/contracts/workflow";

/**
 * Pure detector for SELF-LOOP edges — a connection whose `from` and `to` are the
 * SAME node (a step wired to itself) (Slice 4.AI-REPAIR-COVERAGE-1).
 *
 * Deliberately a DIAGNOSIS-only helper, NOT part of the shared runtime validator
 * `core/workflows/executionReadiness.ts:findGraphIssues` (which gates the engine
 * pre-dispatch, run-now preflight, and the Activate gate). Adding self-loops there
 * would change activation/runtime behavior; this slice must not. Instead — exactly
 * like the invalid-variable-reference path — the diagnosis surfaces it as a
 * Check-level finding that is STRICTER than the engine's `runnable`, WITHOUT
 * touching `runnable`/Activate.
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
