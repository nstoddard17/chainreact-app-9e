import type { WorkflowEdge } from "@/contracts/workflow";

/**
 * Pure detector for REDUNDANT DUPLICATE edges — two-or-more edges that are identical
 * by the graph's own edge-identity key: same `from`, same `to`, AND same `label ?? ""`
 * (Slice 4.AI-REPAIR-COVERAGE-2).
 *
 * The key is EXACTLY the dedup key `WorkflowDefinitionSchema.superRefine` rejects
 * (`${from}->${to}::${label ?? ""}`, contracts/workflowDefinition.ts). So a "duplicate"
 * here is only a truly-redundant copy:
 *   - two unlabeled edges between the same two steps, OR
 *   - two edges between the same two steps carrying the SAME branch label.
 *
 * Edges that share `(from, to)` but differ by `label` are DISTINCT branches (a router /
 * condition fanning, e.g., "yes"/"no" to the same step) and are NEVER flagged — the
 * `label` is the engine's only branch discriminator (services/execution/branching.ts).
 * This is why the key includes `label`; keying on `(from, to)` alone would destroy
 * legitimate branch fan-out.
 *
 * Keep-first: the FIRST edge of each identical group (in source order) is retained; every
 * LATER member is returned as redundant (the `removeEdge` target). Removing the later
 * copies leaves identical reachability + identical branch matching, so the repair is a
 * strict no-op-or-improvement.
 *
 * Deliberately a DIAGNOSIS-only helper, NOT part of the shared runtime validator
 * `core/workflows/executionReadiness.ts:findGraphIssues` (which gates the engine
 * pre-dispatch, run-now preflight, and the Activate gate). Check is intentionally
 * STRICTER than runtime here — exactly like the self-loop / invalid-variable-reference
 * precedents — without touching `runnable` / Activate. A redundant duplicate can only
 * originate from legacy / un-revalidated stored JSONB (every strict write path rejects
 * it via the schema); this defends against that data.
 *
 * Pure: no I/O, no registry, no model.
 */

export interface DuplicateEdge {
  /** Internal edge id of the REDUNDANT copy (the `removeEdge` target). Never rendered. */
  readonly edgeId: string;
  /** Source node id of the duplicated connection. Internal id — never rendered. */
  readonly fromNodeId: string;
  /** Target node id of the duplicated connection. Internal id — never rendered. */
  readonly toNodeId: string;
}

/**
 * Return every redundant duplicate edge (a later member of an identical
 * `(from, to, label ?? "")` group) in source order. The first member of each group is
 * kept and never returned. Empty when there are no duplicates.
 */
export function findDuplicateEdges(
  edges: readonly WorkflowEdge[],
): DuplicateEdge[] {
  const seen = new Set<string>();
  const out: DuplicateEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}::${edge.label ?? ""}`;
    if (seen.has(key)) {
      out.push({ edgeId: edge.id, fromNodeId: edge.from, toNodeId: edge.to });
    } else {
      seen.add(key);
    }
  }
  return out;
}
