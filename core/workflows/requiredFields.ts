import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";
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
}

/** Required-field requirements for one node type, keyed by `provider:type`. */
export interface NodeTypeRequirements {
  readonly displayName: string;
  readonly requiredFields: readonly NodeTypeRequirement[];
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
    out[meta.key] = {
      displayName: meta.displayName,
      requiredFields: meta.fields
        .filter((f: FieldMeta) => f.required)
        .map((f: FieldMeta) => ({ name: f.name, label: f.label })),
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
  return reqs.requiredFields.filter((f) =>
    isRequiredValueMissing((node.config ?? {})[f.name]),
  );
}
