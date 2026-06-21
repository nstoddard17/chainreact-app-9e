/**
 * Canvas-preview eligibility (BUILDER-AGENT-RAIL-CANVAS-PREVIEW-GUARD).
 *
 * Deterministic guard that decides whether an advisory plan is worth offering as a "Show on canvas"
 * preview. The bug it prevents: an AI "deeper suggestions" reply that merely RESTATES the existing
 * workflow (same trigger/action shape) would render duplicate ghost nodes on top of the real ones.
 *
 * Rule: a plan is a meaningful canvas preview only when it introduces at least one step whose
 * `provider:type` shape is NOT already present in the current graph (i.e. it adds or changes
 * structure). A plan that exactly restates — or is a subset of — the current graph's shapes is NOT
 * meaningful and the UI keeps it in the Agent rail as text/setup guidance instead.
 *
 * Fail-safe: an empty/absent plan returns false (nothing to preview). The comparison uses ONLY
 * kind/provider/type (never config values / labels / secrets), so it is privacy-safe by construction.
 *
 * `core/` rule: imports only `contracts/` types (here: structural shapes), framework-free.
 */

/** Minimal node shape used for comparison — kind/provider/type only, no config/labels. */
export interface CanvasPreviewGraphNode {
  /** "trigger" | "action" (any other value is treated as a non-trigger step). */
  readonly kind: string;
  readonly provider: string;
  readonly type: string;
}

/** Minimal plan step shape — role/provider/type only. */
export interface CanvasPreviewPlanStep {
  /** "trigger" | "action" | "logic" (only trigger-ness matters here). */
  readonly role: string;
  readonly provider: string;
  readonly type: string;
}

export interface IsPlanMeaningfulCanvasPreviewInput {
  readonly currentGraph: readonly CanvasPreviewGraphNode[];
  readonly plan: { readonly steps: readonly CanvasPreviewPlanStep[] } | null | undefined;
}

/** Normalized shape key: trigger-ness + provider + type, all lower-cased/trimmed. */
function shapeKey(kindOrRole: string, provider: string, type: string): string {
  const triggerish = kindOrRole.trim().toLowerCase() === "trigger" ? "trigger" : "action";
  return `${triggerish}:${provider.trim().toLowerCase()}:${type.trim().toLowerCase()}`;
}

function countByKey(keys: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return counts;
}

/**
 * True when the proposed plan would add/change graph structure relative to the current draft; false
 * when it only restates (or is a subset of) the existing shapes. Fail-safe toward NOT showing.
 */
export function isPlanMeaningfulCanvasPreview(input: IsPlanMeaningfulCanvasPreviewInput): boolean {
  const steps = input.plan?.steps ?? [];
  if (steps.length === 0) return false; // nothing to preview

  const currentCounts = countByKey(
    input.currentGraph.map((n) => shapeKey(n.kind, n.provider, n.type)),
  );
  const planCounts = countByKey(steps.map((s) => shapeKey(s.role, s.provider, s.type)));

  // Meaningful iff the plan introduces a NEW shape, or MORE of an existing shape than the current
  // graph already has. Exact-restatement and subset plans → every shape is already present → false.
  for (const [key, planCount] of planCounts) {
    if (planCount > (currentCounts.get(key) ?? 0)) return true;
  }
  return false;
}
