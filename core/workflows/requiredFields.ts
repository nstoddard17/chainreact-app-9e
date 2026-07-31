import {
  isVisibleWhenMet,
  type ActionMeta,
  type FieldMeta,
  type FieldVisibilityCondition,
} from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowNode } from "@/contracts/workflow";

/**
 * Metadata-derived required-field primitives (B — shared readiness core).
 *
 * Moved here from `features/workflow-builder/validation/` so BOTH the builder
 * (client) and every server execution entry path (run-now, activate, engine
 * pre-dispatch, webhook, scheduled) can validate against ONE ruleset without a
 * features↔services boundary violation — `core/` imports only `contracts/`, and
 * everyone may import `core/`.
 *
 * `fields[].required` in the action/trigger metadata is the single source of
 * truth. No parallel hardcoded required-field rules anywhere.
 *
 * The original `features/.../buildRequiredFieldsByType` and
 * `features/.../collectBuilderValidationIssues` now re-export these symbols, so
 * existing importers are unchanged.
 */

/**
 * One required field of a node type, sourced from the action/trigger metadata's
 * `fields[].required`. `name` keys into `node.config`; `label` is the
 * author-facing field name used in messages ("…needs a Method").
 */
export interface NodeTypeRequirement {
  readonly name: string;
  readonly label: string;
  /**
   * True when the action/trigger metadata declares a `defaultValue` for this
   * field. A required field WITH a default is always satisfiable without
   * explicit user input — the builder's `deriveDefaultConfig` seeds it at
   * node-creation and the handler's Zod `.default()` fills it at runtime — so
   * it is NEVER a readiness gap, even when the stored config omits it (e.g. a
   * config built outside the builder: AI planner, template import, API, or a
   * smoke fixture). Keeps the metadata/default contract consistent with the
   * handler schema (a required `enum().default("ROWS")` is runnable as-is).
   */
  readonly hasDefault?: boolean;
  /**
   * CONFIG-UX-SETUP-ADVANCED-1 — the field's top-level `visibleWhen`
   * condition, when it declares one. A required field whose condition is NOT
   * met by the node's current config is not shown to the user and is not a
   * readiness gap (its runtime requirement only applies inside the mode that
   * reveals it). Evaluated by `missingRequiredFields` via the shared
   * `isVisibleWhenMet` so client and server agree. Plain data — serializes
   * with the rest of the map (`page.tsx` threads it RSC→client).
   */
  readonly visibleWhen?: FieldVisibilityCondition;
}

/**
 * WORKFLOW-LIVE-TEST-2 — one unsatisfied cross-field group, ready to render.
 * `fields` carries the members that were VISIBLE when the group was evaluated,
 * so the UI can say exactly which fields would satisfy it and focus the first.
 */
export interface MissingRequiredGroup {
  readonly message: string;
  readonly fields: readonly NodeTypeRequirement[];
}

/** Required-field requirements for one node type, keyed by `provider:type`. */
export interface NodeTypeRequirements {
  readonly displayName: string;
  readonly requiredFields: readonly NodeTypeRequirement[];
  /**
   * WORKFLOW-LIVE-TEST-2 — cross-field "at least one of" groups declared by the
   * node's metadata. Absent for the overwhelming majority of node types.
   */
  readonly requiredAnyOf?: readonly RequiredAnyOfGroupRequirement[];
}

/**
 * A `requiredAnyOf` group resolved against the node's field metadata: the raw
 * names are paired with their author-facing labels and visibility conditions so
 * readiness can evaluate and render the group without re-reading the registry.
 */
export interface RequiredAnyOfGroupRequirement {
  readonly message: string;
  readonly fields: readonly NodeTypeRequirement[];
}

/**
 * Map of `provider:type` (== ActionMeta/TriggerMeta `key`) → its required-field
 * requirements. Computed server-side from the discovery registry and threaded
 * into the builder; the values are STATIC (a node type's required fields never
 * change), so the client validates the LIVE config against them.
 */
export type RequiredFieldsByType = Readonly<Record<string, NodeTypeRequirements>>;

const ROUTER_NODE_TYPE = "native:router";

/**
 * Derive the required-field lookup from action/trigger metadata. Pure: takes the
 * meta lists (the server sources them from the discovery registry) and emits a
 * `provider:type` → required-fields map.
 */
export function buildRequiredFieldsByType(
  actionMetas: readonly ActionMeta[],
  triggerMetas: readonly TriggerMeta[],
): RequiredFieldsByType {
  const out: Record<string, NodeTypeRequirements> = {};
  for (const meta of [...actionMetas, ...triggerMetas]) {
    const toRequirement = (f: FieldMeta): NodeTypeRequirement => ({
      name: f.name,
      label: f.label,
      hasDefault: f.defaultValue !== undefined,
      ...(f.visibleWhen ? { visibleWhen: f.visibleWhen } : {}),
    });
    const byName = new Map(meta.fields.map((f: FieldMeta) => [f.name, f]));
    // WORKFLOW-LIVE-TEST-2 — resolve each declared group's names to their field
    // metadata once, here, so evaluation stays a pure function of this map.
    // The meta schema guarantees every name exists; the filter is belt-and-braces.
    const groups = (meta.requiredAnyOf ?? [])
      .map((g) => ({
        message: g.message,
        fields: g.fields
          .map((name) => byName.get(name))
          .filter((f): f is FieldMeta => f !== undefined)
          .map(toRequirement),
      }))
      .filter((g) => g.fields.length > 0);
    out[meta.key] = {
      displayName: meta.displayName,
      requiredFields: meta.fields.filter((f: FieldMeta) => f.required).map(toRequirement),
      ...(groups.length > 0 ? { requiredAnyOf: groups } : {}),
    };
  }
  return out;
}

/**
 * The `provider:type` key a node maps to in `RequiredFieldsByType`. Real nodes
 * store a bare `type` (e.g. `http_request`) so the key is `provider:type`; some
 * call sites / fixtures store the already-combined key (e.g. `native:router`) —
 * tolerated by passing it through unchanged when it already contains a colon.
 */
export function requirementLookupKey(node: WorkflowNode): string {
  return node.type.includes(":") ? node.type : `${node.provider}:${node.type}`;
}

/**
 * A required value is MISSING when it is undefined, null, an empty/whitespace
 * string, or an empty array. `0` and `false` are valid explicit choices and are
 * NOT missing (mirrors the handler-defaults Q5 rule).
 */
export function isRequiredValueMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/**
 * The required fields of `node` that are currently empty, per the metadata
 * lookup. Single source of truth shared by the builder validation collector, the
 * canvas node-status adapter, and the server execution-readiness validator.
 * Router nodes are excluded — their `routes` config has a dedicated structural
 * validator (`router_routes_invalid`).
 *
 * A required field that declares a metadata `defaultValue` (`hasDefault`) is
 * NEVER reported missing: the default is supplied by the builder's
 * `deriveDefaultConfig` at node-creation and by the handler's Zod `.default()`
 * at runtime, so the node is runnable even when the stored config omits the
 * field. This keeps the readiness gate consistent with the handler schema and
 * stops it being stricter than the runtime contract for configs built outside
 * the builder (AI planner, template import, API, smoke fixtures).
 */
export function missingRequiredFields(
  node: WorkflowNode,
  requiredFieldsByType: RequiredFieldsByType | undefined,
): readonly NodeTypeRequirement[] {
  if (!node.type) return [];
  const key = requirementLookupKey(node);
  if (key === ROUTER_NODE_TYPE) return [];
  const reqs = requiredFieldsByType?.[key];
  if (!reqs) return [];
  const config = node.config ?? {};
  return reqs.requiredFields.filter(
    (f) =>
      !f.hasDefault &&
      // CONFIG-UX-SETUP-ADVANCED-1 — a required field hidden by an unmet
      // `visibleWhen` is not a gap; it becomes required once the mode that
      // reveals it is enabled (same evaluation the builder form uses).
      isVisibleWhenMet(f.visibleWhen, config) &&
      isRequiredValueMissing(config[f.name]),
  );
}

/**
 * WORKFLOW-LIVE-TEST-2 — the node's UNSATISFIED cross-field groups.
 *
 * A group is satisfied when ANY of its currently-VISIBLE members holds a value.
 * Two deliberate rules keep it honest:
 *   - A member hidden by an unmet `visibleWhen` can neither satisfy the group
 *     nor be offered as a way to satisfy it — a value stranded in a mode the
 *     user isn't in must not read as complete.
 *   - A group with NO visible members is skipped entirely: it belongs to a mode
 *     that isn't active, so demanding it would be a phantom gap.
 * A member carrying a metadata `defaultValue` satisfies the group, mirroring
 * `missingRequiredFields` — the builder and the handler both supply it.
 *
 * Shared by the builder collector and the server execution-readiness validator,
 * so "Ready" means the same thing on both sides of the wire.
 */
export function missingRequiredGroups(
  node: WorkflowNode,
  requiredFieldsByType: RequiredFieldsByType | undefined,
): readonly MissingRequiredGroup[] {
  if (!node.type) return [];
  const key = requirementLookupKey(node);
  if (key === ROUTER_NODE_TYPE) return [];
  const groups = requiredFieldsByType?.[key]?.requiredAnyOf;
  if (!groups || groups.length === 0) return [];
  const config = node.config ?? {};

  const out: MissingRequiredGroup[] = [];
  for (const group of groups) {
    const visible = group.fields.filter((f) => isVisibleWhenMet(f.visibleWhen, config));
    if (visible.length === 0) continue;
    const satisfied = visible.some(
      (f) => f.hasDefault || !isRequiredValueMissing(config[f.name]),
    );
    if (!satisfied) out.push({ message: group.message, fields: visible });
  }
  return out;
}
