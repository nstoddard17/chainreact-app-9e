import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Display-safe per-field metadata for the at-a-glance node summary
 * (CONFIG-UX-NODE-SUMMARY-1).
 *
 * The collapsed canvas card must be able to say what a node will DO — "Send
 * Channel Message · #support-alerts" — without opening the config panel. The
 * summary itself is computed by the pure `buildNodeConfigSummary`, which needs
 * a node type's FIELD metadata; the canvas adapter is a synchronous converter
 * with no registry access. This module is the bridge: the server derives a
 * `provider:type` → fields lookup once from the discovery registry and threads
 * it into the builder as a static prop (a node type's fields never change),
 * exactly like `buildRequiredFieldsByType` / `buildPreviewSetupFields` /
 * `buildConfigDiffFieldMeta`. There is never a parallel hardcoded field list.
 *
 * The projection is deliberately NARROW — only the keys
 * `buildNodeConfigSummary` reads:
 *
 *   - `name` / `label` / `type` — which config key, its author-facing name, and
 *     whether it is a choice (`select` / `boolean` render an option label),
 *   - `optionsSource` — marks a RESOURCE picker, so the summary shows the
 *     recognizable name the label cache resolved instead of the stored id,
 *   - `options` — static choices, so a mode renders its label not its value,
 *   - `visibleWhen` — a field hidden by an unmet condition is not part of what
 *     runs and must not be summarized (same evaluation as the readiness core),
 *   - `renderedBy` — composite-managed siblings summarize through their owner.
 *
 * `required` is carried only because it is a mandatory key of `FieldMeta`; the
 * summary never reads it. Descriptions, placeholders, defaults, `dependsOn`,
 * numeric bounds and sensitivity are deliberately EXCLUDED — they are dead
 * weight in an RSC→client payload that ships for every node type in the
 * registry, and the card renders none of them. Nothing here is user data: this
 * is metadata about a node TYPE, identical for every account.
 *
 * `core/` rule: imports only `contracts/`. Pure — no React, no fetch, no
 * services, no repositories, no I/O.
 */

/** One node type's display-safe fields for the summary, keyed by `provider:type` (== meta.key). */
export interface NodeSummaryFields {
  readonly displayName: string;
  /**
   * The type's fields, in metadata order (the summary's segment order). A
   * narrow projection that is still a valid `FieldMeta`, so it can be handed
   * straight to `buildNodeConfigSummary` without a second adapter.
   */
  readonly fields: readonly FieldMeta[];
}

/** `provider:type` → its summary field metadata. */
export type NodeSummaryFieldsByType = Readonly<Record<string, NodeSummaryFields>>;

/** Project a registry field down to the display-safe keys the summary reads. */
function toSummaryField(field: FieldMeta): FieldMeta {
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    // Not read by the summary — `FieldMeta` requires it.
    required: field.required,
    ...(field.optionsSource ? { optionsSource: field.optionsSource } : {}),
    ...(field.options ? { options: field.options } : {}),
    ...(field.visibleWhen ? { visibleWhen: field.visibleWhen } : {}),
    ...(field.renderedBy ? { renderedBy: field.renderedBy } : {}),
  };
}

/**
 * Derive the node-summary field lookup from action/trigger metadata. Pure: the
 * server sources the meta lists from the discovery registry and emits a
 * `provider:type` → fields map the client summarizes the LIVE config against.
 */
export function buildNodeSummaryFieldsByType(
  actionMetas: readonly ActionMeta[],
  triggerMetas: readonly TriggerMeta[],
): NodeSummaryFieldsByType {
  const out: Record<string, NodeSummaryFields> = {};
  for (const meta of [...actionMetas, ...triggerMetas]) {
    out[meta.key] = {
      displayName: meta.displayName,
      fields: meta.fields.map(toSummaryField),
    };
  }
  return out;
}
