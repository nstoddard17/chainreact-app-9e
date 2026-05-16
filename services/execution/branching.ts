import type { WorkflowEdge } from "@/contracts/workflow";

/**
 * Pure helpers for the engine's label-aware traversal.
 *
 * Extracted from engine.ts so the per-edge selection rule (§4.1) and the
 * outgoing-edge index (§4.3) live as self-contained pure functions —
 * unit-testable in isolation, easy to read, and keeping engine.ts under
 * the project's max-lines budget. The engine consumes these via two
 * exported entry points: `buildOutgoingEdgeMap` (constructed once per
 * run) and `selectActivatedEdges` (called once per executed node).
 *
 * See docs/slices/parity/engine-branching-plan.md §4.
 */

/**
 * Outgoing-edge index keyed by `from`. Preserves the full
 * {@link WorkflowEdge} (including `label`) so the activation pass can
 * decide per-edge whether the handler's `branchTaken` matches.
 */
export function buildOutgoingEdgeMap(
  edges: readonly WorkflowEdge[],
): ReadonlyMap<string, readonly WorkflowEdge[]> {
  const map = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    let bucket = map.get(edge.from);
    if (!bucket) {
      bucket = [];
      map.set(edge.from, bucket);
    }
    bucket.push(edge);
  }
  return map;
}

export interface EdgeActivationResult {
  /** `to` ids of the outgoing edges that the engine should follow next. */
  readonly activated: readonly string[];
  /**
   * True when the handler returned a string `branchTaken` value that no
   * outgoing labeled edge matches — including the case where the node has
   * no labeled outgoing edges at all. The engine converts this to an
   * INVALID_BRANCH step failure per plan §6.1.
   */
  readonly invalidBranch: boolean;
}

/**
 * Per-edge selection rule for label-aware traversal. See plan §4.1.
 *
 *   - Unlabeled edges (`label === undefined`) are ALWAYS activated,
 *     regardless of `branchTaken`. They model "do this regardless of
 *     branch decision" — cleanup, fan-out from non-branching actions,
 *     and the entire pre-branching workflow corpus.
 *   - Labeled edges require `branchTaken === label`. Multiple edges with
 *     the same label all activate (router fan-out within a branch).
 *   - `branchTaken === null` is the explicit "skip all labeled" choice;
 *     no labeled edge activates, unlabeled still do.
 *   - `branchTaken === undefined` is the §6.2.a permissive default: no
 *     labeled edge activates (the handler made no branch decision);
 *     unlabeled still do. Provider / native handlers that don't know
 *     about branching are unaffected by labeled edges someone wires
 *     downstream of them.
 *
 * INVALID_BRANCH fires only when `branchTaken` is a string and no
 * outgoing labeled edge matches that string. Null / undefined never
 * trigger INVALID_BRANCH (they're explicit no-decision values).
 */
export function selectActivatedEdges(
  outgoingEdges: readonly WorkflowEdge[],
  branchTaken: string | null | undefined,
): EdgeActivationResult {
  const activated: string[] = [];
  let anyLabeledMatched = false;
  for (const edge of outgoingEdges) {
    if (edge.label === undefined) {
      activated.push(edge.to);
      continue;
    }
    if (typeof branchTaken === "string" && branchTaken === edge.label) {
      activated.push(edge.to);
      anyLabeledMatched = true;
    }
  }
  const invalidBranch =
    typeof branchTaken === "string" && !anyLabeledMatched;
  return { activated, invalidBranch };
}
