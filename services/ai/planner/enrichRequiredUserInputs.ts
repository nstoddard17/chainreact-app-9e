/**
 * Server-side enrichment of `requiredUserInput` entries with FieldMeta
 * metadata (Slice 4.AI-22).
 *
 * The planner's parser strictly validates the model-emitted shape
 * (`{label, kind, nodeId?, field?}`). The React Agent's interactive
 * controls (`RequiredInputControl`) need more — the field's label,
 * renderer type, static options or dynamic `optionsSource`, dependsOn
 * parents, multi-select flag, free-text fallback — to render a useful
 * picker instead of a bare bullet list.
 *
 * This module derives those hints from the LIVE registry, never from
 * the model. The model only tells us *which* field is missing (via
 * `nodeId` + `field`); this function maps `nodeId` → patch operation →
 * `provider:type` → ActionMeta/TriggerMeta → FieldMeta → enrichment.
 *
 * No-leak guarantees:
 *   - Returns only display labels, field keys, FieldType enums, static
 *     option `{label, value}` pairs declared in metadata, `optionsSource`
 *     registry keys, and FieldMeta placeholders. NEVER touches resolver
 *     results, secrets, tokens, or live user data.
 *   - When a nodeId / field is unknown / cannot be resolved, returns the
 *     entry UNENRICHED (no fields added) — degrades gracefully so the
 *     UI still gets the bare `label` + `kind` it had pre-AI-22.
 *
 * Server-only. The `features/workflow-builder/**` controls consume the
 * sanitized shape via the AI-9A plan route's response body.
 */

import type { FieldMeta } from "@/contracts/actionMeta";
import { normalizeDependsOn } from "@/contracts/actionMeta";
import {
  getActionMeta,
  getTriggerMeta,
} from "@/services/discovery/_registry";
import type { WorkflowPatch } from "@/services/workflows/patch/types";
import type {
  CurrentWorkflowGraphView,
  PlanRequiredUserInput,
  PlanRequiredUserInputMetadata,
} from "./types";

/**
 * Renderer types that accept free-text input. The React Agent's control
 * shows a typeable input (combobox-style) for these even when static
 * options exist; for non-free-text types (e.g. pure `select` without
 * `multiple`), the user must pick from the dropdown.
 */
const FREE_TEXT_FIELD_TYPES: ReadonlySet<string> = new Set([
  "text",
  "textarea",
  "cron",
  "number", // numeric input is technically typed, but caller can coerce
]);

interface NodeIdentity {
  readonly provider: string;
  readonly type: string;
}

/**
 * Resolve a node's (provider, type) for a required-input `nodeId`.
 *
 * Order:
 *   1. the patch's `addNode` / `replaceTrigger` ops (brand-new nodes — the
 *      common AI-22 case);
 *   2. the CURRENT canvas graph (Slice 4.AI-35) — for `updateNodeConfig`
 *      edits, which only carry `nodeId` + `config`, the provider/type live
 *      on the existing node. Without this, an existing-node edit (e.g.
 *      "change the Slack DM recipient") produced un-enriched bullet text
 *      instead of an interactive control.
 *
 * Returns `null` when neither source knows the node — the entry stays
 * un-enriched (graceful degrade, no incorrect data).
 */
function findNodeIdentity(
  patch: WorkflowPatch | null,
  nodeId: string,
  currentGraph: CurrentWorkflowGraphView | undefined,
): NodeIdentity | null {
  for (const op of patch?.operations ?? []) {
    if (
      (op.op === "addNode" || op.op === "replaceTrigger") &&
      op.node?.id === nodeId
    ) {
      const { provider, type } = op.node;
      if (typeof provider === "string" && typeof type === "string") {
        return { provider, type };
      }
    }
  }
  // updateNodeConfig (and any entry referencing an existing node) — resolve
  // provider/type from the live canvas snapshot.
  const canvasNode = currentGraph?.nodes.find((n) => n.id === nodeId);
  if (canvasNode) {
    return { provider: canvasNode.provider, type: canvasNode.type };
  }
  return null;
}

/**
 * Find the FieldMeta for a given (provider, type, fieldName). Both action
 * and trigger metadata are inspected — the planner doesn't tell us which
 * one applies, and the (provider, type) key is unique across both
 * registries by convention.
 */
function findFieldMeta(
  provider: string,
  type: string,
  fieldName: string,
): { meta: FieldMeta; nodeLabel: string } | null {
  const key = `${provider}:${type}`;
  const action = getActionMeta(key);
  if (action) {
    const field = action.fields.find((f) => f.name === fieldName);
    if (field) return { meta: field, nodeLabel: action.displayName };
  }
  const trigger = getTriggerMeta(key);
  if (trigger) {
    const field = trigger.fields.find((f) => f.name === fieldName);
    if (field) return { meta: field, nodeLabel: trigger.displayName };
  }
  return null;
}

function enrichmentFromFieldMeta(
  provider: string,
  type: string,
  nodeLabel: string,
  field: FieldMeta,
): PlanRequiredUserInputMetadata {
  const out: Record<string, unknown> = {
    provider,
    nodeType: type,
    nodeLabel,
    fieldLabel: field.label,
    fieldType: field.type,
  };

  if (field.multiple === true) out.multiple = true;

  if (field.options && field.options.length > 0) {
    out.options = field.options.map((o) => ({
      label: o.label,
      value: o.value,
    }));
  } else if (field.optionsSource) {
    out.optionsSource = field.optionsSource;
    const deps = normalizeDependsOn(field.dependsOn);
    if (deps.length > 0) out.dependsOn = deps;
  }

  // Free-text affordance: text-typeable renderer types always accept
  // typed input; combobox without static options is also free-text via
  // the optionsSource picker. Pure `select` (no `multiple`) is the
  // strict-pick case where the user MUST choose from the dropdown.
  const isFreeTextType = FREE_TEXT_FIELD_TYPES.has(field.type);
  const isComboboxWithSource = field.type === "combobox" && !!field.optionsSource;
  if (isFreeTextType || isComboboxWithSource) {
    out.allowFreeText = true;
  }

  if (field.placeholder) out.placeholder = field.placeholder;

  return out as PlanRequiredUserInputMetadata;
}

/**
 * Map every `requiredUserInput` entry through the live registry. Entries
 * with no `nodeId` / no `field` / unresolvable nodeType / unknown field
 * pass through unchanged so the UI still gets the bare `label` + `kind`.
 *
 * Pure / deterministic — no DB, no network, no model. The (provider+type
 * → FieldMeta) lookup hits the in-memory discovery registry only.
 */
/**
 * Slice 4.AI-33 — service-side safety net for required-field completeness.
 *
 * `enrichRequiredUserInputs` only DECORATES entries the model already
 * asked for. If the model proposes a node but forgets a required field
 * entirely (no key in `config`), no question reaches the user — they see
 * a generic "preview rejected" instead of an actionable per-field control
 * (the deterministic `MISSING_REQUIRED_FIELD` check rejects the patch, but
 * gives no field-level UI). This pass walks the patch's added nodes and
 * derives a `requiredUserInput` entry for every required field that is
 * ABSENT from config and not already asked about.
 *
 * Deliberately conservative — it only fires on truly-empty required fields
 * (undefined / null / "" / empty array, mirroring the validator's
 * `isEmpty`). A field the model filled with a literal, an upstream
 * `{{nodeId.field}}` reference, OR an `{{AI_FIELD:...}}` placeholder is
 * treated as "the model made a choice" and is NOT second-guessed here —
 * whether an AI_FIELD on a content field is appropriate is governed by the
 * planner prompt rules (R3 content-field completeness), not this net.
 *
 * Pure / deterministic — same in-memory registry lookups as the enricher.
 * Returns BARE entries (`kind: "config_value"`, `nodeId`, `field`, `label`);
 * the caller runs them back through `enrichRequiredUserInputs` so they pick
 * up the same FieldMeta hints (options / optionsSource / fieldType) the
 * interactive control needs.
 */
function isFieldValueEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function deriveMissingRequiredFieldInputs(
  patch: WorkflowPatch | null,
  existing: readonly PlanRequiredUserInput[],
): readonly PlanRequiredUserInput[] {
  if (!patch) return [];
  const seen = new Set(
    existing
      .filter((e) => e.nodeId && e.field)
      .map((e) => `${e.nodeId}::${e.field}`),
  );
  const derived: PlanRequiredUserInput[] = [];
  for (const op of patch.operations ?? []) {
    const node =
      op.op === "addNode" || op.op === "replaceTrigger" ? op.node : null;
    if (!node) continue;
    const key = `${node.provider}:${node.type}`;
    const meta = node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
    if (!meta) continue;
    const config = (node.config ?? {}) as Record<string, unknown>;
    for (const f of meta.fields) {
      if (!f.required) continue;
      if (!isFieldValueEmpty(config[f.name])) continue; // model filled it
      const dedupeKey = `${node.id}::${f.name}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      derived.push({
        label: `${meta.displayName}: "${f.label}" is required — please provide a value.`,
        kind: "config_value",
        nodeId: node.id,
        field: f.name,
      });
    }
  }
  return derived;
}

export function enrichRequiredUserInputs(
  inputs: readonly PlanRequiredUserInput[],
  patch: WorkflowPatch | null,
  currentGraph?: CurrentWorkflowGraphView,
): readonly PlanRequiredUserInput[] {
  return inputs.map((entry) => {
    // Pass-through entries that are NOT field-specific. `select_integration`,
    // `choose_trigger`, `clarification`, `provider_choice` don't carry a
    // field reference.
    if (!entry.nodeId || !entry.field) return entry;

    const nodeIdentity = findNodeIdentity(patch, entry.nodeId, currentGraph);
    if (!nodeIdentity) return entry;

    const fieldLookup = findFieldMeta(
      nodeIdentity.provider,
      nodeIdentity.type,
      entry.field,
    );
    if (!fieldLookup) return entry;

    const enrichment = enrichmentFromFieldMeta(
      nodeIdentity.provider,
      nodeIdentity.type,
      fieldLookup.nodeLabel,
      fieldLookup.meta,
    );

    return { ...entry, ...enrichment };
  });
}
