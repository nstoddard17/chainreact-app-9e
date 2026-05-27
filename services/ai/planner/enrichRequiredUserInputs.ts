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
import type { PlanRequiredUserInput, PlanRequiredUserInputMetadata } from "./types";

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
 * Walk the patch's `addNode` operations to find the node with the given
 * id. Returns its provider/type so we can look up the registry meta.
 *
 * Note: we ONLY look at `addNode` ops here — `updateNodeConfig` targets
 * a pre-existing node we'd need the workflow's full graph to resolve. The
 * common AI-22 case is a brand-new workflow where the planner emits one
 * `addNode` per node and asks for missing required fields on those.
 * Update-config flows (rare for planner-generated patches) fall through
 * to unenriched entries — degraded UX, no incorrect data.
 */
function findNodeIdentity(
  patch: WorkflowPatch | null,
  nodeId: string,
): NodeIdentity | null {
  if (!patch) return null;
  for (const op of patch.operations ?? []) {
    if (op.op === "addNode" && op.node?.id === nodeId) {
      const { provider, type } = op.node;
      if (typeof provider === "string" && typeof type === "string") {
        return { provider, type };
      }
    }
    if (op.op === "replaceTrigger" && op.node?.id === nodeId) {
      const { provider, type } = op.node;
      if (typeof provider === "string" && typeof type === "string") {
        return { provider, type };
      }
    }
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
export function enrichRequiredUserInputs(
  inputs: readonly PlanRequiredUserInput[],
  patch: WorkflowPatch | null,
): readonly PlanRequiredUserInput[] {
  return inputs.map((entry) => {
    // Pass-through entries that are NOT field-specific. `select_integration`,
    // `choose_trigger`, `clarification` don't carry a field reference.
    if (!entry.nodeId || !entry.field) return entry;

    const nodeIdentity = findNodeIdentity(patch, entry.nodeId);
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
