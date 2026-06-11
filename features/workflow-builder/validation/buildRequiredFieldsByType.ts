import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type {
  NodeTypeRequirements,
  RequiredFieldsByType,
} from "./collectBuilderValidationIssues";

/**
 * BUILDER-READINESS — derive the required-field lookup from action/trigger
 * metadata. Pure: takes the meta lists (the page sources them from the discovery
 * registry, server-side) and emits a `provider:type` → required-fields map.
 *
 * The set of required fields for a node type is STATIC, so this is computed once
 * server-side and threaded into the builder; the client then validates the LIVE
 * `node.config` against it. No parallel hardcoded rules — `fields[].required` is
 * the single source of truth.
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
        .filter((f) => f.required)
        .map((f) => ({ name: f.name, label: f.label })),
    };
  }
  return out;
}
