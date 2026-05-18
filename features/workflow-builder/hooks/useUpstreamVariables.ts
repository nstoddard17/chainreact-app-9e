"use client";

import { useMemo } from "react";
import type { ActionMeta, OutputMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import { buildLatestValuesBySource } from "@/core/workflows/latestRunValues";
import { findUpstreamNodes } from "@/core/workflows/upstreamVariables";
import { useGraphSlice } from "../state/graphSlice";
import { useRunSlice } from "../state/runSlice";
import {
  findNativeActionByKey,
  useNativeActions,
} from "./useNativeActions";
import {
  findNativeTriggerByKey,
  useNativeTriggers,
} from "./useNativeTriggers";
import {
  findProviderActionByKey,
  useProviderActionsForProviders,
} from "./useProviderActions";

/**
 * Compose graphSlice + meta hooks into the variable-picker's source
 * tree.
 *
 * Slice 3.7 — strict-stable hook profile (one call each to graphSlice
 * selectors + the three meta hooks, exactly once per render). The
 * fan-out across upstream providers happens inside
 * `useProviderActionsForProviders(providerIds)`, which keeps its own
 * fixed hook profile regardless of how many providers the caller
 * passes. No dynamic `useProviderActions(provider)` calls in a loop.
 *
 * Behavior:
 *   - Returns an empty `sources` array when `currentNodeId === null`
 *     (e.g. the rail isn't open), when the node isn't found, or when
 *     the node has no ancestors.
 *   - The trigger node — if it's an ancestor — surfaces under the
 *     `"trigger"` alias the runtime engine uses. The picker shows the
 *     alias because that's what authors copy/paste between workflows.
 *     The node id alias is intentionally hidden to avoid confusion.
 *   - Action ancestors surface under their node id.
 *   - Nodes whose meta hasn't loaded yet are omitted (loading state
 *     belongs to the meta hooks, not the picker).
 *   - Nodes whose meta has zero outputs are omitted entirely (the
 *     picker has nothing useful to render for them; we don't invent
 *     a fallback shape — keeps the OutputMeta contract honest).
 */

export type VariableSourceKind = "trigger" | "action";

export interface VariableSource {
  /** Source identifier — `"trigger"` alias for the trigger ancestor, node id otherwise. */
  readonly sourceId: string;
  /** Human label rendered as the section header. */
  readonly displayName: string;
  readonly kind: VariableSourceKind;
  /** Provider id, useful for filtering / icons. `"native"` for native nodes. */
  readonly provider: string;
  /** Recursive output tree. Empty arrays are filtered upstream. */
  readonly outputs: readonly OutputMeta[];
}

export interface UseUpstreamVariablesResult {
  /** Sources in graph order: trigger first, then actions in topological-ish order. */
  readonly sources: readonly VariableSource[];
  /** True while any upstream provider catalog is still loading. */
  readonly loading: boolean;
  /**
   * Slice 3.9 — per-source latest-run output, keyed by `sourceId`.
   * The picker uses this to render inline previews next to each
   * output button. The empty record means "no latest run" (idle, or
   * the latest run's trigger node id has drifted from the current
   * graph). Picker MUST treat missing keys as `absent`; it MUST NOT
   * fall back to mock data or a synthetic shape.
   *
   * Read directly from `runSlice.detail` via a single selector
   * subscription. No fetch from this hook; no polling; no save.
   */
  readonly latestValuesBySource: Readonly<Record<string, unknown>>;
}

const EMPTY_LATEST_VALUES: Readonly<Record<string, unknown>> = Object.freeze({});

const EMPTY_RESULT: UseUpstreamVariablesResult = Object.freeze({
  sources: [],
  loading: false,
  latestValuesBySource: EMPTY_LATEST_VALUES,
});

const NATIVE_PROVIDER = "native";
const TRIGGER_ALIAS = "trigger";

export function useUpstreamVariables(
  currentNodeId: string | null,
): UseUpstreamVariablesResult {
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  // Slice 3.9 — single new subscription to the run slice's detail so
  // the picker re-renders when a Run Now finishes. Reading directly
  // from the slice keeps the hook free of any fetch / poll / save
  // side effect (the slice is the only owner of those).
  const latestRunDetail = useRunSlice((s) => s.detail);

  const nativeActions = useNativeActions();
  const nativeTriggers = useNativeTriggers();

  // 1. Pure topology: find strict ancestors of the current node.
  const ancestorIds: readonly string[] = useMemo(() => {
    if (currentNodeId === null) return [];
    return findUpstreamNodes({
      currentNodeId,
      nodes: pendingNodes,
      edges: pendingEdges,
    });
  }, [currentNodeId, pendingNodes, pendingEdges]);

  // 2. Resolve ancestor ids to WorkflowNode objects + collect the set
  //    of provider ids that need their catalogs loaded.
  const ancestorNodes = useMemo(() => {
    const set = new Set(ancestorIds);
    return pendingNodes.filter((n) => set.has(n.id));
  }, [ancestorIds, pendingNodes]);

  const upstreamProviderIds = useMemo(() => {
    const set = new Set<string>();
    for (const node of ancestorNodes) {
      if (node.kind === "action" && node.provider !== NATIVE_PROVIDER) {
        set.add(node.provider);
      }
    }
    return [...set];
  }, [ancestorNodes]);

  // 3. Stable-profile multi-provider catalog loader. ONE hook,
  //    regardless of how many providers the current node depends on.
  const providerCatalogs = useProviderActionsForProviders(upstreamProviderIds);

  // 4. Slice 3.9 — compute the latest-run value map. Derived from
  //    `runSlice.detail` + the current graph's trigger node id. Kept
  //    in its own useMemo so the (often unchanged) sources work above
  //    doesn't re-run when only the run changes.
  const currentTriggerNodeId = useMemo(() => {
    const trig = pendingNodes.find((n) => n.kind === "trigger");
    return trig?.id ?? null;
  }, [pendingNodes]);

  const latestValuesBySource = useMemo(() => {
    return buildLatestValuesBySource({
      detail: latestRunDetail,
      currentTriggerNodeId,
    });
  }, [latestRunDetail, currentTriggerNodeId]);

  // 5. Build the source list from the ancestor nodes + their metas.
  return useMemo<UseUpstreamVariablesResult>(() => {
    if (currentNodeId === null || ancestorNodes.length === 0) {
      // Even with no sources, emit the same `latestValuesBySource`
      // shape — keeps the consumer's `Object.keys(...)` reads safe.
      return latestValuesBySource === EMPTY_LATEST_VALUES
        ? EMPTY_RESULT
        : { ...EMPTY_RESULT, latestValuesBySource };
    }

    const sources: VariableSource[] = [];

    for (const node of ancestorNodes) {
      const meta = resolveMeta(node, {
        nativeActions: nativeActions.actions,
        nativeTriggers: nativeTriggers.triggers,
        providerCatalogs: providerCatalogs.byProvider,
      });
      if (!meta) continue; // not loaded yet, or unknown — skip silently
      const outputs = meta.outputs;
      if (outputs.length === 0) continue; // nothing useful to insert

      const sourceId = node.kind === "trigger" ? TRIGGER_ALIAS : node.id;
      sources.push({
        sourceId,
        displayName: meta.displayName,
        kind: node.kind,
        provider: node.provider,
        outputs,
      });
    }

    return {
      sources,
      loading:
        nativeActions.loading ||
        nativeTriggers.loading ||
        providerCatalogs.loading,
      latestValuesBySource,
    };
  }, [
    currentNodeId,
    ancestorNodes,
    nativeActions.actions,
    nativeActions.loading,
    nativeTriggers.triggers,
    nativeTriggers.loading,
    providerCatalogs.byProvider,
    providerCatalogs.loading,
    latestValuesBySource,
  ]);
}

interface ResolvedMeta {
  displayName: string;
  outputs: readonly OutputMeta[];
}

interface ResolveCtx {
  nativeActions: readonly ActionMeta[];
  nativeTriggers: readonly TriggerMeta[];
  providerCatalogs: Readonly<Record<string, readonly ActionMeta[]>>;
}

function resolveMeta(
  node: { kind: "trigger" | "action"; provider: string; type: string },
  ctx: ResolveCtx,
): ResolvedMeta | undefined {
  if (!node.type) return undefined;
  const key = `${node.provider}:${node.type}`;
  if (node.kind === "trigger") {
    if (node.provider !== NATIVE_PROVIDER) {
      // Provider triggers don't yet ship payloadShape through this
      // path. Out of scope for Slice 3.7; deferred with provider
      // trigger wrappers.
      return undefined;
    }
    const trigMeta = findNativeTriggerByKey(ctx.nativeTriggers, key);
    if (!trigMeta) return undefined;
    return {
      displayName: trigMeta.displayName,
      outputs: trigMeta.payloadShape,
    };
  }
  if (node.provider === NATIVE_PROVIDER) {
    const m = findNativeActionByKey(ctx.nativeActions, key);
    return m ? { displayName: m.displayName, outputs: m.outputs } : undefined;
  }
  const providerActions = ctx.providerCatalogs[node.provider] ?? [];
  const m = findProviderActionByKey(providerActions, key);
  return m ? { displayName: m.displayName, outputs: m.outputs } : undefined;
}
