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

/**
 * REACT-AGENT-RESOLVER-RECOVERY-1 — preview node id → the patch REF `planToBuilderPatch` mints for
 * it (`preview-step-3` → `p1`).
 *
 * The rail's setup card speaks in preview ids; the graph slice reports the real node ids it minted
 * keyed by patch ref. This is the honest bridge between them, derived from the SAME `kept` filter
 * and the SAME `p${i}` numbering the patch builder uses — so "open the step editor for THIS field"
 * can land on the node that field actually became, never a positional guess.
 *
 * Steps the patch skips (role `logic`) simply have no entry. Pure.
 */
export function previewIdToPatchRef(
  plan: WorkflowPlan | null | undefined,
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!plan || !Array.isArray(plan.steps)) return out;
  const kept = plan.steps
    .map((step, originalIndex) => ({ step, originalIndex }))
    .filter(({ step }) => step.role === "trigger" || step.role === "action");
  kept.forEach(({ originalIndex }, i) => {
    out[previewStepId(originalIndex)] = `p${i}`;
  });
  return out;
}

/**
 * REACT-AGENT-RESOLVER-RECOVERY-1 — which REAL draft node should "open the step editor" land on for
 * a given preview field, after the preview has been applied?
 *
 * Exact by construction, never positional:
 *   - EDIT path — `definitionToDraftPreview` mints `previewId === node.id`, so the preview id IS the
 *     node id in the replaced graph (confirmed against the post-apply node list).
 *   - ADDITIVE path — preview id → patch ref ({@link previewIdToPatchRef}) → the id the graph slice
 *     actually minted for that ref, which stays correct even when a proposed trigger was skipped.
 *
 * Returns `undefined` when the target cannot be resolved; callers fall back to their default
 * behavior rather than guessing a node. Pure.
 */
export function resolvePreviewFocusNodeId(input: {
  readonly plan: WorkflowPlan | null | undefined;
  readonly previewId: string;
  /** Post-apply node ids — used to confirm the edit path's preview id really exists. */
  readonly nodeIds: readonly string[];
  /** Present only on the additive path (the graph slice's `addedNodeIdByRef`). */
  readonly addedNodeIdByRef?: Readonly<Record<string, string>> | undefined;
}): string | undefined {
  if (input.addedNodeIdByRef) {
    const ref = previewIdToPatchRef(input.plan)[input.previewId];
    return ref ? input.addedNodeIdByRef[ref] : undefined;
  }
  return input.nodeIds.includes(input.previewId) ? input.previewId : undefined;
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
