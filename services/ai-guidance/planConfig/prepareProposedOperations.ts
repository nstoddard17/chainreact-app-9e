/**
 * EDIT-path config preparation for model-proposed patch operations (REACT-CONFIG-COVERAGE-1).
 *
 * Before an edit proposal enters the existing pipeline (ref resolution → materialize →
 * `validateWorkflowPatch`), the config-bearing operations (`updateNodeConfig`, `addNode`,
 * `replaceTrigger`) get the SAME treatment plan-step config gets on the create path:
 *
 *   1. `sanitizeConfigAgainstFields` — declared, non-secret/connection fields only; type coercion;
 *      static-option label→value mapping; explicit `false`/`0` preserved.
 *   2. `resolveProposedOptionValues` — dynamic (`optionsSource`) values verified / label-mapped
 *      through the canonical account-scoped resolvers; `dependsOn` parents read from the merged
 *      (existing + proposed) node config.
 *   3. Anything unusable is REMOVED from the operation and reported as a deferred field, so the
 *      route surfaces a targeted setup note instead of silently dropping the user's constraint —
 *      and so validation never fails on a value we already know is unusable.
 *
 * The operation LIST/shape is never changed (no ops added/removed/reordered) — only the config
 * payload of config-bearing ops is filtered. An `updateNodeConfig` left with ZERO keys after
 * filtering is kept as-is (it becomes a no-op merge) so op indices stay stable for the caller.
 *
 * Server-only; async only for the resolver pass (injectable for tests).
 */

import type { PatchOperation } from "@/services/workflows/patch/types";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import { sanitizeConfigAgainstFields } from "./sanitizeProposedConfig";
import {
  resolveProposedOptionValues,
  type ResolveOptionsFn,
  type ResolveTarget,
} from "./resolveProposedOptionValues";

/** Capability + existing config for an EXISTING node referenced by an operation. */
export interface NodeCapabilityContext {
  readonly kind: "trigger" | "action";
  readonly capabilityKey: string;
  readonly existingConfig: Readonly<Record<string, unknown>>;
}

export interface PrepareProposedOperationsInput {
  readonly operations: readonly PatchOperation[];
  /** Resolve an existing-node reference (opaque ref OR real id) to its capability + config. */
  readonly nodeContextForRef: (nodeRef: string) => NodeCapabilityContext | null;
  readonly userId: string;
  readonly workflowId?: string;
  /** Test seam for the canonical options resolver. */
  readonly resolveImpl?: ResolveOptionsFn;
}

export interface PreparedOperations {
  readonly operations: PatchOperation[];
  /**
   * Fields removed because the supplied value was unusable/unresolvable — surface as targeted
   * setup input. Safe: field KEY names only, never values.
   */
  readonly deferredFields: readonly { readonly nodeRef: string; readonly field: string }[];
}

interface ConfigBearing {
  readonly opIndex: number;
  readonly nodeRef: string;
  readonly kind: "trigger" | "action";
  readonly capabilityKey: string;
  readonly proposedKeys: readonly string[];
  /** Sanitized proposed config (op keys only). */
  readonly sanitized: Record<string, unknown>;
  /** Merged existing + sanitized config for dependsOn resolution. */
  readonly merged: Record<string, unknown>;
}

export async function prepareProposedOperations(
  input: PrepareProposedOperationsInput,
): Promise<PreparedOperations> {
  const operations = input.operations.map((op) => ({ ...op })) as PatchOperation[];
  const deferred: { nodeRef: string; field: string }[] = [];
  const bearings: ConfigBearing[] = [];

  operations.forEach((op, opIndex) => {
    if (op.op === "updateNodeConfig") {
      const ctx = input.nodeContextForRef(op.nodeId);
      if (!ctx) return; // unknown ref → the existing pipeline rejects it with an exact reason
      const meta =
        ctx.kind === "trigger" ? getTriggerMeta(ctx.capabilityKey) : getActionMeta(ctx.capabilityKey);
      if (!meta) return;
      const { config, deferredFields } = sanitizeConfigAgainstFields(op.config, meta.fields);
      deferredFields.forEach((field) => deferred.push({ nodeRef: op.nodeId, field }));
      bearings.push({
        opIndex,
        nodeRef: op.nodeId,
        kind: ctx.kind,
        capabilityKey: ctx.capabilityKey,
        proposedKeys: Object.keys(config),
        sanitized: config,
        merged: { ...ctx.existingConfig, ...config },
      });
      return;
    }
    if (op.op === "addNode" || op.op === "replaceTrigger") {
      const node = op.node;
      if (!node.config || Object.keys(node.config).length === 0) return;
      const kind: "trigger" | "action" = node.kind === "trigger" ? "trigger" : "action";
      const capabilityKey = `${node.provider}:${node.type}`;
      const meta = kind === "trigger" ? getTriggerMeta(capabilityKey) : getActionMeta(capabilityKey);
      if (!meta) return;
      const { config, deferredFields } = sanitizeConfigAgainstFields(node.config, meta.fields);
      deferredFields.forEach((field) => deferred.push({ nodeRef: node.id, field }));
      bearings.push({
        opIndex,
        nodeRef: node.id,
        kind,
        capabilityKey,
        proposedKeys: Object.keys(config),
        sanitized: config,
        merged: { ...config },
      });
    }
  });

  // Canonical-resolver pass over the proposed dynamic values only.
  const targets: ResolveTarget[] = bearings.map((b) => ({
    ref: String(b.opIndex),
    kind: b.kind,
    capabilityKey: b.capabilityKey,
    config: b.merged,
    onlyFields: b.proposedKeys,
  }));
  const resolved =
    targets.length > 0
      ? await resolveProposedOptionValues({
          userId: input.userId,
          ...(input.workflowId ? { workflowId: input.workflowId } : {}),
          targets,
          ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {}),
        })
      : [];
  const resolvedByOpIndex = new Map(resolved.map((r) => [Number(r.ref), r]));

  for (const bearing of bearings) {
    const r = resolvedByOpIndex.get(bearing.opIndex);
    const finalConfig: Record<string, unknown> = {};
    for (const key of bearing.proposedKeys) {
      const source = r ? r.config : bearing.sanitized;
      if (key in source) finalConfig[key] = source[key];
    }
    if (r) {
      for (const field of r.deferredFields) {
        if (bearing.proposedKeys.includes(field)) deferred.push({ nodeRef: bearing.nodeRef, field });
      }
    }
    const op = operations[bearing.opIndex]!;
    if (op.op === "updateNodeConfig") {
      operations[bearing.opIndex] = { ...op, config: finalConfig };
    } else if (op.op === "addNode" || op.op === "replaceTrigger") {
      operations[bearing.opIndex] = { ...op, node: { ...op.node, config: finalConfig } };
    }
  }

  return { operations, deferredFields: deferred };
}
