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
import {
  sanitizeSeedConfig,
  type PreviewSetupFieldsByType,
} from "@/core/workflows/previewSetupFields";

/**
 * HERMES-AGENT-GUIDED-PREVIEW-SETUP-1 — optional guided-setup seeding. `previewConfig` is keyed by the
 * SAME preview node id `planToDraftPreview` mints (`preview-step-${i+1}`, i = index over ALL plan
 * steps incl. logic). `setupFieldsByType` is the supported-fields metadata used to sanitize: only
 * known, non-sensitive keys are seeded; everything else is dropped. Absent ⇒ nodes get empty config
 * (original behavior).
 */
export interface PlanToBuilderPatchOptions {
  readonly previewConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly setupFieldsByType?: PreviewSetupFieldsByType;
}

/** Matches `planToDraftPreview`'s `previewStepId` (index over ALL plan steps, 1-based). */
function previewStepId(originalIndex: number): string {
  return `preview-step-${originalIndex + 1}`;
}

export function planToBuilderPatch(
  plan: WorkflowPlan | null | undefined,
  options: PlanToBuilderPatchOptions = {},
): BuilderPreviewPatch | null {
  if (!plan || !Array.isArray(plan.steps)) return null;

  // HERMES-AGENT-MUTATION-PREVIEW — a deterministic-mutation plan marks the swapped step with
  // `replaces` (the existing action's capability). Emit a TARGETED in-place swap instead of an additive
  // add, so applying replaces the old action rather than appending after it. Only the FIRST such step is
  // honored (the channel-swap is a single replacement); model-extracted plans never set `replaces`.
  const replaceStep = plan.steps.find(
    (s) => s.role === "action" && s.replaces && typeof s.replaces.provider === "string" && typeof s.replaces.type === "string",
  );
  if (replaceStep && replaceStep.replaces) {
    const originalIndex = plan.steps.indexOf(replaceStep);
    const fields = options.setupFieldsByType?.[`${replaceStep.provider}:${replaceStep.type}`];
    const config = sanitizeSeedConfig(options.previewConfig?.[previewStepId(originalIndex)], fields);
    return {
      kind: "replace_action",
      from: { provider: replaceStep.replaces.provider, type: replaceStep.replaces.type },
      to: {
        provider: replaceStep.provider,
        type: replaceStep.type,
        ...(Object.keys(config).length > 0 ? { config } : {}),
      },
    };
  }

  // Only trigger/action steps map to real V2 graph nodes (no "logic" kind). Keep order, but remember
  // each step's ORIGINAL index so its preview id (and thus its guided-setup config) aligns.
  const kept = plan.steps
    .map((step, originalIndex) => ({ step, originalIndex }))
    .filter(({ step }) => step.role === "trigger" || step.role === "action");
  if (kept.length === 0) return null;

  const nodes: BuilderPatchNode[] = kept.map(({ step, originalIndex }, i) => {
    const fields = options.setupFieldsByType?.[`${step.provider}:${step.type}`];
    const raw = options.previewConfig?.[previewStepId(originalIndex)];
    const config = sanitizeSeedConfig(raw, fields);
    return {
      ref: `p${i}`,
      kind: step.role as "trigger" | "action",
      provider: step.provider,
      type: step.type,
      ...(Object.keys(config).length > 0 ? { config } : {}),
    };
  });

  // Linear chain over the kept steps (the advisory plan carries no branch topology).
  const edges: BuilderPatchEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ fromRef: nodes[i]!.ref, toRef: nodes[i + 1]!.ref });
  }

  return { kind: "additive", nodes, edges };
}
