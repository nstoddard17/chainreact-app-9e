/**
 * Fold the preview's guided-setup values into an edit proposal before Apply
 * (REACT-AGENT-PREVIEW-PROVENANCE-CLOSEOUT-1).
 *
 * The two apply paths were not symmetric. The ADDITIVE path seeds a new node's config from
 * `previewConfig` through `planToBuilderPatch`, so a value typed into the rail's setup card lands in
 * the draft. The EDIT path hands `proposedDefinition` straight to `replaceGraphLocal` — which meant
 * the same card, rendered for the same user against an edit proposal, silently dropped every value
 * they entered. That is not a cosmetic gap: the audience they picked and the recipient they typed are
 * precisely the decisions enrichment is forbidden to make for them, so losing them on Apply defeats
 * the whole ownership model.
 *
 * The overlay is keyed by node id, which is exactly what `previewConfig` already holds on this path
 * (`definitionToDraftPreview` sets `previewId = node.id`). Pure: no React, no store, no provider
 * knowledge — the definition goes in, a new definition comes out, and Apply stays the only writer.
 */

import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

/**
 * Return a definition whose node configs carry the user's preview-setup values.
 *
 * Identity is preserved when nothing overlays, so an Apply that changes nothing cannot manufacture a
 * new object (and with it a spurious "changed" signal downstream).
 *
 * `""`, `false` and `0` overlay like any other value — they are explicit user decisions on this
 * platform, and skipping them on truthiness is the exact bug the provenance layer exists to avoid.
 * Only keys the user actually has state for are written; an absent key leaves the proposal's value.
 */
export function applyPreviewConfigToDefinition(
  definition: WorkflowDefinition,
  previewConfig: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): WorkflowDefinition {
  let changed = false;

  const nodes = definition.nodes.map((node) => {
    const overlay = previewConfig[node.id];
    if (!overlay) return node;
    const keys = Object.keys(overlay);
    if (keys.length === 0) return node;

    const config: Record<string, unknown> = { ...(node.config ?? {}) };
    let nodeChanged = false;
    for (const key of keys) {
      if (Object.is(config[key], overlay[key])) continue;
      config[key] = overlay[key];
      nodeChanged = true;
    }
    if (!nodeChanged) return node;
    changed = true;
    return { ...node, config };
  });

  return changed ? { ...definition, nodes } : definition;
}
