import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflow";

/**
 * Detect whether a save MEANINGFULLY changes a workflow's TRIGGER(s).
 *
 * Why this matters (see docs/slices/phase-4/workflows/active-edit-stale-trigger-audit.md):
 * an ACTIVE workflow registers its triggers (`trigger_resources` rows + provider
 * subscriptions) at activation time, keyed by `(nodeId, provider, eventType, config)`, while
 * the runtime executes `draftDefinition` LIVE. A save that changes the trigger leaves those
 * registrations stale — the dispatcher fires the old node id (`TRIGGER_NODE_NOT_FOUND`) or
 * the old filter config, and the new trigger is never registered. The save path uses this to
 * deactivate an active workflow on a trigger change so it re-registers cleanly via Reactivate
 * → Resume.
 *
 * "Meaningful trigger change" = a trigger node added, removed, or whose
 * id / provider / type / config differs. Deliberately IGNORES everything that does NOT affect
 * trigger registration: action nodes, edges, node positions (layout), and `displayName`
 * (labels) — those are safe to keep live on an active workflow.
 *
 * Pure + order-independent. Config is compared by a stable (recursively key-sorted) value so
 * key reordering is not treated as a change.
 */
export function triggerChanged(prev: WorkflowDefinition, next: WorkflowDefinition): boolean {
  const prevSigs = triggerSignatures(prev);
  const nextSigs = triggerSignatures(next);
  if (prevSigs.length !== nextSigs.length) return true;
  return prevSigs.some((sig, i) => sig !== nextSigs[i]);
}

function triggerSignatures(def: WorkflowDefinition): string[] {
  return def.nodes
    .filter((n) => n.kind === "trigger")
    .map(triggerSignature)
    .sort();
}

/** Runtime-critical identity of a trigger node — excludes position + displayName. */
function triggerSignature(node: WorkflowNode): string {
  return JSON.stringify([node.id, node.provider, node.type, stableValue(node.config)]);
}

/** Recursively key-sort objects so `{a,b}` and `{b,a}` compare equal; arrays keep order. */
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = stableValue(obj[key]);
    return out;
  }
  return value;
}
