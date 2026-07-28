/**
 * Deterministic detector for BROKEN `{{nodeId.path}}` variable references in node
 * configs (Slice 4.AI-REPAIR-3G).
 *
 * "Broken" here means the SAME class the deterministic repair strategy already
 * acts on (`buildVariableRepairOutcome`) and the design-time field validator
 * (`config-modal/fields/_variableValidator`) surfaces as `missing_node`: a
 * reference whose source id is neither the `trigger` alias NOR a node present in
 * the workflow — i.e. it points at a deleted / unknown step. This is exactly the
 * production bug where a Slack Message field still held
 * `{{<deleted-node-uuid>.to}}` yet "Check workflow" reported ready-to-run.
 *
 * Reuse, not duplication: tokenization is delegated to `parseReferences` (the same
 * pure parser the field validator + patch validator use), so the detector can
 * never disagree with them on what a reference IS. The "is it in the graph?" rule
 * mirrors the repair strategy verbatim, so anything this flags is repair-eligible
 * by the same definition.
 *
 * Scope (deliberately narrow for this slice):
 *   - Scans TOP-LEVEL config keys whose value is a string or an array of strings —
 *     the exact shape `repairVariableReference` can rewrite (its `fieldPath` is a
 *     top-level key; nested paths are a documented follow-up). Deep-nested refs and
 *     the `missing_field` / downstream cases are out of scope here.
 *   - Pure: no registry, no I/O, no model. Field-label resolution + safe display
 *     happen in the diagnostics layer that consumes this.
 */

import { parseReferences } from "./variables/variableReferences";

const TRIGGER_ALIAS = "trigger";

/** Minimal node shape — satisfied by both `WorkflowDefinition` nodes and the AI graph view. */
export interface InvalidRefScanNode {
  readonly id: string;
  readonly config: Record<string, unknown>;
}

export interface InvalidVariableReference {
  /** Id of the node whose config holds the broken reference (repair target). */
  readonly nodeId: string;
  /** Top-level config key holding it (the `repairVariableReference` fieldPath). */
  readonly fieldKey: string;
  /** The `{{...}}` token exactly as written — user-authored, safe to display. */
  readonly token: string;
  /** The unknown/deleted source id segment of the token (== the parsed `nodeId`). */
  readonly sourceId: string;
  /** Dotted path of the reference (empty for a whole-node `{{nodeId}}` token). */
  readonly refPath: string;
}

/** Top-level config values we scan: a string, or an array's string elements. */
function configStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

/**
 * Return every broken (deleted-/unknown-node) variable reference across the given
 * nodes, in node + field order. Empty when every reference resolves to the trigger
 * alias or an existing node.
 */
export function findInvalidVariableReferences(
  nodes: readonly InvalidRefScanNode[],
): InvalidVariableReference[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const out: InvalidVariableReference[] = [];
  for (const node of nodes) {
    for (const [fieldKey, value] of Object.entries(node.config ?? {})) {
      for (const str of configStrings(value)) {
        for (const ref of parseReferences(str)) {
          if (ref.nodeId !== TRIGGER_ALIAS && !nodeIds.has(ref.nodeId)) {
            out.push({
              nodeId: node.id,
              fieldKey,
              token: ref.token,
              sourceId: ref.nodeId,
              refPath: ref.path,
            });
          }
        }
      }
    }
  }
  return out;
}
