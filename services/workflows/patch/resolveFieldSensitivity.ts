import type { FieldSensitivity } from "@/contracts/actionMeta";
import { getNodeSchema } from "@/services/ai/tools/providerCatalog";

/**
 * Schema-aware sensitivity resolver (AI-REPAIR-SAFETY-HARDENING CS-2).
 *
 * Maps each config-bearing patch operation's touched field key(s) to its declared
 * `FieldMeta.sensitivity` (if any), read from the live discovery registry via
 * `getNodeSchema`. This is the IMPURE, schema-reading step that runs BEFORE the pure
 * `classifyOperationSafety` — so the pure classifier keeps taking plain data (an
 * opIndex → fieldKey → sensitivity map) and never imports the registry itself. The
 * registry read is deterministic + in-memory (no I/O, no DB, no model, no network).
 *
 * No-leak: the resolved map carries only the `FieldSensitivity` ENUM per field KEY —
 * never a config value, token, provider body, or identity.
 *
 * Only `updateNodeConfig` (its config keys) and `repairVariableReference` (its
 * `fieldPath`) carry field-level writes; every other op kind contributes nothing.
 * A node whose `provider:type` isn't in the registry, or a field with no
 * `sensitivity`, simply contributes no entry — the apply gate then falls back to the
 * key-name heuristics alone (current behavior; never weakened).
 */

/** Minimal node shape — just what's needed to build the `provider:type` lookup key. */
export interface SensitivityNodeRef {
  readonly id: string;
  readonly provider?: string | null;
  readonly type?: string | null;
}

/** opIndex → (fieldKey → declared sensitivity). Plain data for the pure classifier. */
export type ResolvedFieldSensitivity = ReadonlyMap<
  number,
  Readonly<Record<string, FieldSensitivity>>
>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Pull the (nodeId, fieldKeys) a single op writes, or null when it writes no config field. */
function configTarget(op: unknown): { nodeId: string; keys: readonly string[] } | null {
  if (!isPlainObject(op) || typeof op.op !== "string") return null;
  if (op.op === "updateNodeConfig") {
    if (typeof op.nodeId !== "string" || !isPlainObject(op.config)) return null;
    const keys = Object.keys(op.config);
    return keys.length > 0 ? { nodeId: op.nodeId, keys } : null;
  }
  if (op.op === "repairVariableReference") {
    if (typeof op.nodeId !== "string" || typeof op.fieldPath !== "string" || op.fieldPath.length === 0) {
      return null;
    }
    return { nodeId: op.nodeId, keys: [op.fieldPath] };
  }
  return null;
}

/**
 * Resolve declared field sensitivity for every config-bearing op. Accepts `unknown`
 * operations (raw client input) and guards each shape, so a malformed op never throws —
 * it just contributes no entry (the heuristics still apply at the gate).
 */
export function resolveFieldSensitivity(
  operations: unknown,
  nodes: readonly SensitivityNodeRef[],
): ResolvedFieldSensitivity {
  const out = new Map<number, Record<string, FieldSensitivity>>();
  if (!Array.isArray(operations)) return out;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const schemaCache = new Map<string, ReturnType<typeof getNodeSchema>>();

  operations.forEach((op, index) => {
    const target = configTarget(op);
    if (!target) return;
    const node = nodeById.get(target.nodeId);
    if (!node?.provider || !node?.type) return;

    const key = `${node.provider}:${node.type}`;
    let schema = schemaCache.get(key);
    if (!schema) {
      schema = getNodeSchema(key);
      schemaCache.set(key, schema);
    }
    if (!schema.ok) return;

    const rec: Record<string, FieldSensitivity> = {};
    for (const fieldKey of target.keys) {
      const field = schema.data.fields.find((f) => f.name === fieldKey);
      if (field?.sensitivity) rec[fieldKey] = field.sensitivity;
    }
    if (Object.keys(rec).length > 0) out.set(index, rec);
  });

  return out;
}
