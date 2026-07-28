"use client";

import { useMemo } from "react";
import type { ActionCategory, FieldMeta } from "@/contracts/actionMeta";
import { collectConfigVariableReferences } from "@/core/workflows/variables/configVariableReferences";
import {
  describeSampleChildren,
  flattenOutputFields,
  looksSecretLike,
} from "@/core/workflows/dataMapFields";
import { formatLatestValuePreview } from "@/core/workflows/formatLatestValuePreview";
import { buildLatestValuesBySource } from "@/core/workflows/latestRunValues";
import { formatTypeKey, getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { resolveValueAtPath } from "@/core/workflows/resolveValueAtPath";
import { formatReference } from "@/core/workflows/variables/variableReferences";
import { useGraphSlice } from "../state/graphSlice";
import { useRunSlice } from "../state/runSlice";
import { useNativeActions } from "./useNativeActions";
import { useNativeTriggers } from "./useNativeTriggers";
import { useProviderActionsForProviders } from "./useProviderActions";
import { useProviderTriggers } from "./useProviderTriggers";
import {
  fieldLabelFor,
  isNonEmpty,
  NATIVE_PROVIDER,
  orderNodesForDataMap,
  resolveNodeMeta,
  sourceLabelFor,
  sourceLoadingFor,
  TRIGGER_ALIAS,
  type ResolvedNodeMeta,
} from "./workflowDataMapModel";

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

export interface DataMapConfiguredField {
  /** Human field label (never the raw key). */
  readonly label: string;
  readonly status: "configured" | "missing";
  /**
   * A short, safe preview of the configured value — shown ONLY for non-sensitive
   * scalar fields whose value is not a variable token. null otherwise (the row
   * then shows just the configured/missing status). Never a sensitive value.
   */
  readonly valuePreview: string | null;
}

export interface DataMapOutput {
  /** Dotted path inside the source's data, e.g. `message.text`. */
  readonly path: string;
  /** Display type label (OutputType for schema fields, plus `"null"` from samples). */
  readonly type: string;
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
  /**
   * True for an object output we could NOT expand (no schema `fields[]` and no
   * sample object to discover children from). The UI shows a "run a test to
   * inspect fields" hint instead of leaving a bare `object` row.
   */
  readonly objectNeedsTest: boolean;
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
  /** Configured + required-missing fields with a safe status (and safe value preview). */
  readonly configuredFields: readonly DataMapConfiguredField[];
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

      const configuredFields = meta?.found
        ? configuredFieldsFor(node.config, meta.fields)
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

      // Sample is shown ONLY for non-sensitive scalar values from an already-
      // sanitized run output. Objects / arrays / fileRefs (and sensitive fields)
      // never render an inline value — only the type badge.
      const scalarSampleFor = (path: string, sensitive: boolean): string | null => {
        if (sensitive || !sourceHasSample) return null;
        const preview = formatLatestValuePreview(
          resolveValueAtPath(latestForSource, path),
        );
        return preview.kind === "scalar" ? preview.preview : null;
      };

      const expectedOutputs: DataMapOutput[] = [];
      for (const f of flatFields) {
        // Sample-driven flattening: a schema object WITHOUT declared children is
        // expanded one level from the sanitized sample when one exists; otherwise
        // it stays a single row flagged for the "run a test" hint.
        if (f.type === "object" && !f.sensitive) {
          const resolved = sourceHasSample
            ? resolveValueAtPath(latestForSource, f.path)
            : { found: false, value: undefined };
          const children = resolved.found
            ? describeSampleChildren(resolved.value)
            : null;
          if (children && children.length > 0) {
            for (const c of children) {
              const childPath = `${f.path}.${c.key}`;
              const childSensitive = looksSecretLike(childPath);
              expectedOutputs.push({
                path: childPath,
                type: c.type,
                sensitive: childSensitive,
                copyToken: formatReference({ nodeId: sourceId, path: childPath }),
                sample: childSensitive ? null : c.scalarPreview,
                objectNeedsTest: false,
              });
            }
            continue;
          }
          expectedOutputs.push({
            path: f.path,
            type: f.type,
            sensitive: false,
            ...(f.description ? { description: f.description } : {}),
            copyToken: formatReference({ nodeId: sourceId, path: f.path }),
            sample: null,
            objectNeedsTest: true,
          });
          continue;
        }
        expectedOutputs.push({
          path: f.path,
          type: f.type,
          sensitive: f.sensitive,
          ...(f.description ? { description: f.description } : {}),
          copyToken: formatReference({ nodeId: sourceId, path: f.path }),
          sample: scalarSampleFor(f.path, f.sensitive),
          objectNeedsTest: false,
        });
      }

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
        configuredFields,
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
// Graph ordering, meta resolution, and label/loading helpers are pure + hook-free
// and live in ./workflowDataMapModel (imported above). Only the config-summary
// helpers below depend on this file's consumer types, so they stay here.

/**
 * Configured / required-missing field summary for a node. Includes every
 * CONFIGURED field plus REQUIRED fields that are empty (so "Missing" is visible);
 * optional-empty fields are skipped to avoid noise. Values are surfaced only for
 * safe, non-sensitive scalars via `safeConfigPreview` — never sensitive content.
 */
function configuredFieldsFor(
  config: Record<string, unknown>,
  fields: readonly FieldMeta[],
): DataMapConfiguredField[] {
  const out: DataMapConfiguredField[] = [];
  for (const field of fields) {
    const value = config[field.name];
    const configured = isNonEmpty(value);
    if (!configured && !field.required) continue;
    out.push({
      label: field.label,
      status: configured ? "configured" : "missing",
      valuePreview: configured ? safeConfigPreview(field, value) : null,
    });
  }
  return out;
}

/**
 * A short preview of a configured value, ONLY when it's safe to show: the field
 * is not declared sensitive and its key doesn't read secret-like, and the value
 * is a plain scalar that isn't a `{{variable}}` reference. Everything else
 * returns null (the UI then shows only the configured/missing status).
 */
function safeConfigPreview(field: FieldMeta, value: unknown): string | null {
  if (field.sensitivity !== undefined || looksSecretLike(field.name)) return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.includes("{{")) return null; // variable reference → status only
    return trimmed.length <= 32 ? trimmed : `${trimmed.slice(0, 31)}…`;
  }
  return null; // arrays / objects → status only
}
