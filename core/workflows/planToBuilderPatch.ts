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
import { isSecretLikeKey } from "@/core/security/secretKeys";

/**
 * REACT-CONFIG-COVERAGE-1 — defense-in-depth filter for SERVER-SANITIZED plan-step config before it
 * seeds the local draft. The route already filtered values against registry FieldMeta (declared,
 * non-secret/connection fields only; typed; resolver-verified); this client-side pass only re-drops
 * empties and secret-shaped keys so a compromised/older server response still can't seed a secret.
 * Explicit `false` / `0` are preserved.
 */
function sanitizePlanSeedConfig(
  raw: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (isSecretLikeKey(key)) continue;
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) continue;
    out[key] = value;
  }
  return out;
}

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

  // Only trigger/action steps map to real V2 graph nodes (no "logic" kind). Keep order, but remember
  // each step's ORIGINAL index so its preview id (and thus its guided-setup config) aligns.
  const kept = plan.steps
    .map((step, originalIndex) => ({ step, originalIndex }))
    .filter(({ step }) => step.role === "trigger" || step.role === "action");
  if (kept.length === 0) return null;

  const nodes: BuilderPatchNode[] = kept.map(({ step, originalIndex }, i) => {
    const fields = options.setupFieldsByType?.[`${step.provider}:${step.type}`];
    const raw = options.previewConfig?.[previewStepId(originalIndex)];
    // REACT-CONFIG-COVERAGE-1 — seed BOTH sources: the server-sanitized values the user supplied in
    // their request (step.config), overridden by anything the user typed/picked on the guided setup
    // card (previewConfig wins — it is the later, explicit edit).
    const planSeed = sanitizePlanSeedConfig(step.config);
    const cardSeed = sanitizeSeedConfig(raw, fields);
    const config = { ...planSeed, ...cardSeed };
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
