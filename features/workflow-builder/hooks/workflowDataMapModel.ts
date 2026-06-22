import type {
  ActionCategory,
  ActionMeta,
  FieldMeta,
  OutputMeta,
} from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { formatTypeKey } from "@/core/workflows/nodeDisplayName";
import { findNativeActionByKey } from "./useNativeActions";
import { findNativeTriggerByKey } from "./useNativeTriggers";
import { findProviderActionByKey } from "./useProviderActions";
import { findProviderTriggerByKey } from "./useProviderTriggers";

/**
 * Pure, hook-free model helpers for `useWorkflowDataMap` (Slice 4.BUILDER-DATA-MAP).
 *
 * Extracted from the hook so the hook itself stays a focused composition + render
 * mapping. Everything here is side-effect-free (no React, no fetch, no store) and
 * derives only from the current draft graph + already-loaded metadata catalogs.
 */

export const NATIVE_PROVIDER = "native";
export const TRIGGER_ALIAS = "trigger";

export interface ResolvedNodeMeta {
  readonly found: boolean;
  readonly displayName: string;
  readonly category: ActionCategory;
  readonly fields: readonly FieldMeta[];
  readonly outputs: readonly OutputMeta[];
}

export interface ResolveCtx {
  readonly nativeActions: readonly ActionMeta[];
  readonly nativeTriggers: readonly TriggerMeta[];
  readonly providerCatalogs: Readonly<Record<string, readonly ActionMeta[]>>;
  readonly providerTriggers: readonly TriggerMeta[];
}

const NOT_FOUND: ResolvedNodeMeta = Object.freeze({
  found: false,
  displayName: "",
  category: "other",
  fields: [],
  outputs: [],
});

export function resolveNodeMeta(
  node: WorkflowNode,
  ctx: ResolveCtx,
): ResolvedNodeMeta {
  if (!node.type) return NOT_FOUND;
  const key = `${node.provider}:${node.type}`;
  if (node.kind === "trigger") {
    const trig =
      node.provider === NATIVE_PROVIDER
        ? findNativeTriggerByKey(ctx.nativeTriggers, key)
        : findProviderTriggerByKey(ctx.providerTriggers, key);
    if (!trig) return NOT_FOUND;
    return {
      found: true,
      displayName: trig.displayName,
      category: trig.category,
      fields: trig.fields,
      outputs: trig.payloadShape,
    };
  }
  const action =
    node.provider === NATIVE_PROVIDER
      ? findNativeActionByKey(ctx.nativeActions, key)
      : findProviderActionByKey(ctx.providerCatalogs[node.provider] ?? [], key);
  if (!action) return NOT_FOUND;
  return {
    found: true,
    displayName: action.displayName,
    category: action.category,
    fields: action.fields,
    outputs: action.outputs,
  };
}

/**
 * Is the catalog that WOULD resolve this node still loading? Used to tell
 * "metadata pending" apart from "metadata loaded but node unknown".
 */
export function sourceLoadingFor(
  node: WorkflowNode,
  loading: {
    nativeActions: boolean;
    nativeTriggers: boolean;
    providerCatalogs: boolean;
    providerTriggers: boolean;
  },
): boolean {
  if (node.kind === "trigger") {
    return node.provider === NATIVE_PROVIDER
      ? loading.nativeTriggers
      : loading.providerTriggers;
  }
  return node.provider === NATIVE_PROVIDER
    ? loading.nativeActions
    : loading.providerCatalogs;
}

export function isNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true; // numbers / booleans are explicit choices
}

export function fieldLabelFor(
  fieldKey: string,
  fields: readonly FieldMeta[] | undefined,
): string {
  const match = fields?.find((f) => f.name === fieldKey);
  return match?.label ?? formatTypeKey(fieldKey);
}

export function sourceLabelFor(
  sourceId: string,
  ctx: {
    triggerLabel: string;
    resolved: Map<string, ResolvedNodeMeta>;
    broken: boolean;
  },
): string {
  if (sourceId === TRIGGER_ALIAS) return ctx.triggerLabel;
  if (ctx.broken) return "Unknown step";
  const meta = ctx.resolved.get(sourceId);
  // Friendly name when resolved; a neutral fallback otherwise — NEVER the raw id.
  return meta?.found && meta.displayName ? meta.displayName : "Earlier step";
}

/**
 * Order nodes for the Data Map: forward graph order via BFS from the roots
 * (nodes with no incoming edge — the trigger is naturally a root and surfaces
 * first). Disconnected nodes and cycle members are appended in array order.
 * Pure; cycle-safe via a visited set.
 */
export function orderNodesForDataMap(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): WorkflowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) indegree.set(n.id, 0);
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
    const list = adj.get(e.from);
    if (list) list.push(e.to);
    else adj.set(e.from, [e.to]);
  }

  // Roots in array order, but triggers first so a start node always leads.
  const roots = nodes
    .filter((n) => (indegree.get(n.id) ?? 0) === 0)
    .sort((a, b) => triggerRank(a) - triggerRank(b));

  const visited = new Set<string>();
  const ordered: WorkflowNode[] = [];
  const queue: WorkflowNode[] = [...roots];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    ordered.push(node);
    for (const toId of adj.get(node.id) ?? []) {
      const next = byId.get(toId);
      if (next && !visited.has(toId)) queue.push(next);
    }
  }
  // Append anything unreachable from a root (disconnected pieces / pure cycles).
  for (const n of nodes) if (!visited.has(n.id)) ordered.push(n);
  return ordered;
}

function triggerRank(node: WorkflowNode): number {
  return node.kind === "trigger" ? 0 : 1;
}
