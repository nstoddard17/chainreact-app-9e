/**
 * Deterministic WorkflowPlan → additive builder patch (HERMES-AGENT-APPLY-PREVIEW-PATCH).
 *
 * Converts a capability-VALIDATED `WorkflowPlan` (the source of truth — NOT the display `DraftPreview`)
 * into a {@link BuilderPreviewPatch}: a declarative, ADDITIVE-ONLY set of nodes + linear edges the
 * builder applies to its local draft when the user explicitly clicks "Apply preview".
 *
 * Properties:
 *   - DETERMINISTIC + MODEL-FREE: pure mapping. No network, no model, no ids, no randomness. Refs are
 *     positional patch-local handles (`p0`, `p1`, …); the graph slice mints REAL ids on apply.
 *   - ADDITIVE-ONLY: emits `addNode` + `addEdge` (as `nodes`/`edges`). NEVER delete/replace/
 *     update-config/replace-trigger/branch-rewrite (the contract has no such ops this slice).
 *   - NO CONFIG/SECRETS: a patch node carries provider/type LABELS only. The builder adds the node
 *     with EMPTY config so required fields surface as "needs setup" — nothing is inferred.
 *   - LIMITATION: V2 graph nodes are only `trigger`/`action` (no "logic" kind), so `logic` plan steps
 *     are SKIPPED; the kept trigger/action steps are chained in their original order.
 *   - Returns `null` when there is nothing additive to apply (no trigger/action steps).
 *
 * Building a patch changes nothing — it is a pure value. Applying it is the graph slice's job, and
 * even that only mutates LOCAL draft state (no save/activate/run, no separate workflow).
 */

import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type {
  BuilderPatchEdge,
  BuilderPatchNode,
  BuilderPreviewPatch,
} from "@/contracts/workflowPlanPreview";

export function planToBuilderPatch(plan: WorkflowPlan | null | undefined): BuilderPreviewPatch | null {
  if (!plan || !Array.isArray(plan.steps)) return null;

  // Only trigger/action steps map to real V2 graph nodes (no "logic" kind). Keep order.
  const kept = plan.steps.filter((s) => s.role === "trigger" || s.role === "action");
  if (kept.length === 0) return null;

  const nodes: BuilderPatchNode[] = kept.map((step, i) => ({
    ref: `p${i}`,
    kind: step.role as "trigger" | "action",
    provider: step.provider,
    type: step.type,
  }));

  // Linear chain over the kept steps (the advisory plan carries no branch topology).
  const edges: BuilderPatchEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ fromRef: nodes[i]!.ref, toRef: nodes[i + 1]!.ref });
  }

  return { kind: "additive", nodes, edges };
}
