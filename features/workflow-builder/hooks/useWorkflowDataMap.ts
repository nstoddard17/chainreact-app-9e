"use client";

import { useMemo } from "react";
import type {
  ActionCategory,
  ActionMeta,
  FieldMeta,
  OutputMeta,
  OutputType,
} from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { collectConfigVariableReferences } from "@/core/workflows/configVariableReferences";
import { flattenOutputFields } from "@/core/workflows/dataMapFields";
import { formatLatestValuePreview } from "@/core/workflows/formatLatestValuePreview";
import { buildLatestValuesBySource } from "@/core/workflows/latestRunValues";
import { formatTypeKey, getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { resolveValueAtPath } from "@/core/workflows/resolveValueAtPath";
import { formatReference } from "@/core/workflows/variableReferences";
import { useGraphSlice } from "../state/graphSlice";
import { useRunSlice } from "../state/runSlice";
import { findNativeActionByKey, useNativeActions } from "./useNativeActions";
import { findNativeTriggerByKey, useNativeTriggers } from "./useNativeTriggers";
import {
  findProviderActionByKey,
  useProviderActionsForProviders,
} from "./useProviderActions";
import {
  findProviderTriggerByKey,
  useProviderTriggers,
} from "./useProviderTriggers";

/**
 * Compose graphSlice + the builder meta hooks into a user-facing data outline
 * for the top-level **Data Map** tab (Slice 4.BUILDER-DATA-MAP-MVP-1).
 *
 * Frontend-only MVP: everything here is derived from the current DRAFT graph
 * (`pendingNodes` / `pendingEdges`) and existing node/action/trigger metadata.
 * There is no run-result / sample-data plumbing in this slice — "last sample
 * output" stays the deferred node-level Data tab's concern.
 *
 * Mirrors `useUpstreamVariables`' strict-stable hook profile: one call each to
 * the graphSlice selectors + the meta hooks, with the per-provider fan-out
 * handled inside `useProviderActionsForProviders` (which keeps its own fixed
 * hook profile). No dynamic `useProviderActions(provider)` calls in a loop.
 *
 * No-leak rules baked into the SHAPE this returns:
 *   - Raw config VALUES are never surfaced — only the LABELS of configured
 *     fields (`configuredFieldLabels`).
 *   - Variable references are surfaced as a FRIENDLY source label + path
 *     (`DataMapVariableUse`), never the raw `{{nodeId.path}}` token (which
 *     carries an internal node id). Broken refs say "Unknown step".
 *   - The only copyable variable tokens are the TRIGGER's `{{trigger.<path>}}`
 *     (carries no id). Action-output copy tokens are deferred (they'd require
 *     the raw node id).
 */

const NATIVE_PROVIDER = "native";
const TRIGGER_ALIAS = "trigger";

export interface DataMapVariableUse {
  /** Friendly source label — "Trigger" or the upstream step's display name. Never a raw id. */
  readonly sourceLabel: string;
  /** Dotted path inside the source's data (empty when the whole source is referenced). */
  readonly path: string;
  /** Friendly label of the field that uses this variable. */
  readonly fieldLabel: string;
  /**
   * True when the referenced source is neither the trigger alias nor a node
   * present in the current graph (a deleted/unknown step). Same definition as
   * `core/workflows/invalidVariableReferences.ts`.
   */
  readonly broken: boolean;
}

export interface DataMapOutput {
  /** Dotted path inside the source's data, e.g. `message.text`. */
  readonly path: string;
  readonly type: OutputType;
  readonly description?: string;
  readonly sensitive: boolean;
  /**
   * Canonical, copyable variable token for this field — `{{trigger.<path>}}` for
   * the trigger (alias), `{{<nodeId>.<path>}}` for an action. The node id is a
   * workflow-local identifier (not a secret); it is exactly what authors paste
   * into later steps and what the runtime resolver consumes.
   */
  readonly copyToken: string;
  /**
   * Sanitized scalar sample value from the latest test run, or null when there's
   * no sample, the value isn't scalar, or the field is sensitive. Sourced from
   * the already-redacted `runSlice.detail` (author-test-gated server-side); the
   * Data Map never reads raw provider payloads.
   */
  readonly sample: string | null;
}

export interface DataMapNode {
  readonly nodeId: string;
  readonly kind: "trigger" | "action";
  readonly displayName: string;
  readonly provider: string;
  /** Friendly provider label when known, else the provider id. */
  readonly providerLabel: string;
  /** Operation label — the action/trigger's display name, or a humanized type. */
  readonly typeLabel: string;
  readonly category: ActionCategory | null;
  /** True once this node's metadata has resolved. */
  readonly metaResolved: boolean;
  /** True while this node's metadata catalog is still loading. */
  readonly loadingMeta: boolean;
  /** Labels of fields that have a non-empty configured value. NEVER the values. */
  readonly configuredFieldLabels: readonly string[];
  /** Upstream variables this node's config references. */
  readonly usesVariables: readonly DataMapVariableUse[];
  /** Output fields this node is expected to produce (from metadata, flattened). */
  readonly expectedOutputs: readonly DataMapOutput[];
  /** True when expected outputs are known from metadata. */
  readonly outputsKnown: boolean;
  /** Canonical source id for variable tokens — `"trigger"` alias or node id. */
  readonly sourceId: string;
  /** True when some produced fields were hidden by the depth / count caps. */
  readonly outputsTruncated: boolean;
}

export interface UseWorkflowDataMapResult {
  /** Nodes in forward graph order: trigger / start first, then actions. */
  readonly nodes: readonly DataMapNode[];
  /** True while any relevant metadata catalog is still loading. */
  readonly loading: boolean;
  /** True when the workflow has ≥1 action node (drives outline vs empty state). */
  readonly hasActions: boolean;
  /** True when the workflow has no nodes at all. */
  readonly isEmpty: boolean;
  /** True when the latest tracked run captured sample output for ≥1 source. */
  readonly sampleAvailable: boolean;
}

export interface UseWorkflowDataMapOptions {
  /** Provider id → friendly label, for the provider chip. Falls back to the id. */
  readonly providerLabels?: Readonly<Record<string, string>>;
}

const EMPTY_RESULT: UseWorkflowDataMapResult = Object.freeze({
  nodes: [],
  loading: false,
  hasActions: false,
  isEmpty: true,
  sampleAvailable: false,
});

export function useWorkflowDataMap(
  options?: UseWorkflowDataMapOptions,
): UseWorkflowDataMapResult {
  const providerLabels = options?.providerLabels;
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  // Single subscription to the latest tracked run so sample values appear after a
  // test run finishes. Read-only — no fetch / poll / save here (runSlice owns that).
  const latestRunDetail = useRunSlice((s) => s.detail);

  const nativeActions = useNativeActions();
  const nativeTriggers = useNativeTriggers();

  // All non-native ACTION provider ids — fanned out under one stable-profile hook.
  const actionProviderIds = useMemo(() => {
    const set = new Set<string>();
    for (const n of pendingNodes) {
      if (n.kind === "action" && n.provider !== NATIVE_PROVIDER) set.add(n.provider);
    }
    return [...set];
  }, [pendingNodes]);
  const providerCatalogs = useProviderActionsForProviders(actionProviderIds);

  // A workflow has at most one trigger, so a single-provider trigger hook suffices.
  const triggerProvider = useMemo<string | null>(() => {
    const trig = pendingNodes.find(
      (n) => n.kind === "trigger" && n.provider !== NATIVE_PROVIDER,
    );
    return trig?.provider ?? null;
  }, [pendingNodes]);
  const providerTriggers = useProviderTriggers(triggerProvider);

  // Sanitized latest-run sample values keyed by source id (`"trigger"` alias /
  // node id). Reuses the SAME bridge the variable picker uses — no second
  // resolver, no new data path. Empty when nothing has been run.
  const currentTriggerNodeId = useMemo<string | null>(() => {
    const trig = pendingNodes.find((n) => n.kind === "trigger");
    return trig?.id ?? null;
  }, [pendingNodes]);
  const latestValuesBySource = useMemo(
    () =>
      buildLatestValuesBySource({
        detail: latestRunDetail,
        currentTriggerNodeId,
      }),
    [latestRunDetail, currentTriggerNodeId],
  );

  return useMemo<UseWorkflowDataMapResult>(() => {
    if (pendingNodes.length === 0) return EMPTY_RESULT;

    const nodeIds = new Set(pendingNodes.map((n) => n.id));
    const ordered = orderNodesForDataMap(pendingNodes, pendingEdges);

    // Resolve every node's metadata once, so display names are available both
    // for the node card AND for resolving the friendly source label of a
    // variable reference that points at another node.
    const resolved = new Map<string, ResolvedNodeMeta>();
    for (const node of ordered) {
      resolved.set(
        node.id,
        resolveNodeMeta(node, {
          nativeActions: nativeActions.actions,
          nativeTriggers: nativeTriggers.triggers,
          providerCatalogs: providerCatalogs.byProvider,
          providerTriggers: providerTriggers.triggers,
        }),
      );
    }

    const triggerNode = ordered.find((n) => n.kind === "trigger");
    const triggerLabel = triggerNode
      ? resolved.get(triggerNode.id)?.displayName ?? "Trigger"
      : "Trigger";

    const loading =
      nativeActions.loading ||
      nativeTriggers.loading ||
      providerCatalogs.loading ||
      providerTriggers.loading;

    const nodes: DataMapNode[] = ordered.map((node) => {
      const meta = resolved.get(node.id);
      const metaResolved = meta?.found ?? false;
      const sourceState = sourceLoadingFor(node, {
        nativeActions: nativeActions.loading,
        nativeTriggers: nativeTriggers.loading,
        providerCatalogs: providerCatalogs.loading,
        providerTriggers: providerTriggers.loading,
      });

      const displayName = getNodeDisplayName(
        { kind: node.kind, provider: node.provider, type: node.type, ...(node.displayName ? { displayName: node.displayName } : {}) },
        meta?.found ? { displayName: meta.displayName } : null,
      );
      const typeLabel = meta?.found
        ? meta.displayName
        : node.type
          ? formatTypeKey(node.type)
          : node.kind === "trigger"
            ? "Trigger"
            : "Action";

      const configuredFieldLabels = meta?.found
        ? configuredFieldLabelsFor(node.config, meta.fields)
        : [];

      const usesVariables = collectConfigVariableReferences(node).map((ref) => {
        const broken = ref.sourceId !== TRIGGER_ALIAS && !nodeIds.has(ref.sourceId);
        const sourceLabel = sourceLabelFor(ref.sourceId, {
          triggerLabel,
          resolved,
          broken,
        });
        const fieldLabel = fieldLabelFor(ref.fieldKey, meta?.fields);
        return { sourceLabel, path: ref.refPath, fieldLabel, broken };
      });

      // Canonical source id: the trigger uses the `"trigger"` alias (carries no
      // id and is the form authors paste); actions use their node id. Both are
      // exactly what the runtime resolver consumes — no second token scheme.
      const sourceId = node.kind === "trigger" ? TRIGGER_ALIAS : node.id;
      const { fields: flatFields, truncated: outputsTruncated } =
        flattenOutputFields(meta?.outputs ?? []);
      const sourceHasSample = Object.prototype.hasOwnProperty.call(
        latestValuesBySource,
        sourceId,
      );
      const latestForSource = latestValuesBySource[sourceId];

      const expectedOutputs: DataMapOutput[] = flatFields.map((f) => {
        // Sample is shown ONLY for non-sensitive scalar values from an already-
        // sanitized run output. Objects / arrays / fileRefs (and sensitive
        // fields) never render an inline value — only the type badge.
        let sample: string | null = null;
        if (!f.sensitive && sourceHasSample) {
          const preview = formatLatestValuePreview(
            resolveValueAtPath(latestForSource, f.path),
          );
          sample = preview.kind === "scalar" ? preview.preview : null;
        }
        return {
          path: f.path,
          type: f.type,
          sensitive: f.sensitive,
          ...(f.description ? { description: f.description } : {}),
          copyToken: formatReference({ nodeId: sourceId, path: f.path }),
          sample,
        };
      });

      return {
        nodeId: node.id,
        kind: node.kind,
        displayName,
        provider: node.provider,
        providerLabel: providerLabels?.[node.provider] ?? node.provider,
        typeLabel,
        category: meta?.found ? meta.category : null,
        metaResolved,
        loadingMeta: !metaResolved && sourceState,
        configuredFieldLabels,
        usesVariables,
        expectedOutputs,
        outputsKnown: expectedOutputs.length > 0,
        sourceId,
        outputsTruncated,
      };
    });

    return {
      nodes,
      loading,
      hasActions: pendingNodes.some((n) => n.kind === "action"),
      isEmpty: false,
      sampleAvailable: Object.keys(latestValuesBySource).length > 0,
    };
  }, [
    pendingNodes,
    pendingEdges,
    providerLabels,
    latestValuesBySource,
    nativeActions.actions,
    nativeActions.loading,
    nativeTriggers.triggers,
    nativeTriggers.loading,
    providerCatalogs.byProvider,
    providerCatalogs.loading,
    providerTriggers.triggers,
    providerTriggers.loading,
  ]);
}

// ─── Internal helpers ────────────────────────────────────────────────────────

interface ResolvedNodeMeta {
  readonly found: boolean;
  readonly displayName: string;
  readonly category: ActionCategory;
  readonly fields: readonly FieldMeta[];
  readonly outputs: readonly OutputMeta[];
}

interface ResolveCtx {
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

function resolveNodeMeta(
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
function sourceLoadingFor(
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

/** Labels of fields that hold a non-empty configured value. Values are never read out. */
function configuredFieldLabelsFor(
  config: Record<string, unknown>,
  fields: readonly FieldMeta[],
): string[] {
  const out: string[] = [];
  for (const field of fields) {
    if (isNonEmpty(config[field.name])) out.push(field.label);
  }
  return out;
}

function isNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true; // numbers / booleans are explicit choices
}

function fieldLabelFor(
  fieldKey: string,
  fields: readonly FieldMeta[] | undefined,
): string {
  const match = fields?.find((f) => f.name === fieldKey);
  return match?.label ?? formatTypeKey(fieldKey);
}

function sourceLabelFor(
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
