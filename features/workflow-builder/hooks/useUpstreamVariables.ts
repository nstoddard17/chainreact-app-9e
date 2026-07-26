"use client";

import { useMemo } from "react";
import type { ActionMeta, OutputMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import { applyDynamicOutputs } from "@/core/workflows/dynamicOutputs";
import { buildLatestValuesBySource } from "@/core/workflows/latestRunValues";
import { findUpstreamNodes } from "@/core/workflows/upstreamVariables";
import {
  AI_PROVIDER_ID,
  isConnectionlessProvider,
} from "@/core/integrations/connectionlessProviders";
import {
  useDynamicTriggerOutputs,
  type UseDynamicTriggerOutputsResult,
} from "./useDynamicTriggerOutputs";
import { useGraphSlice } from "../state/graphSlice";
import { useRunSlice } from "../state/runSlice";
import { findAiActionByKey, useAiActions } from "./useAiActions";
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
import {
  findProviderTriggerByKey,
  useProviderTriggers,
} from "./useProviderTriggers";

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
  /**
   * TYPEFORM-DYNAMIC-OUTPUTS-UI-AND-AGENT-CLOSEOUT-1 — the schema-dependent trigger's resolve state,
   * so a surface can render "select the form first", a loading row, or a retry/reconnect action
   * instead of silently showing a short list. `not_applicable` for the ~all-triggers case.
   */
  readonly dynamicTriggerOutputs: UseDynamicTriggerOutputsResult;
}

const EMPTY_LATEST_VALUES: Readonly<Record<string, unknown>> = Object.freeze({});

const NOT_APPLICABLE_DYNAMIC: UseDynamicTriggerOutputsResult = Object.freeze({
  outputs: [] as readonly OutputMeta[],
  status: "not_applicable",
  message: null,
  rejectedKeys: [] as readonly string[],
  retry: () => {},
}) as UseDynamicTriggerOutputsResult;

const EMPTY_RESULT: UseUpstreamVariablesResult = Object.freeze({
  sources: [],
  loading: false,
  latestValuesBySource: EMPTY_LATEST_VALUES,
  dynamicTriggerOutputs: NOT_APPLICABLE_DYNAMIC,
});

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

  // AI catalog loads only when an ANCESTOR is an AI node — a workflow with
  // no AI step never calls the endpoint (same posture as the provider
  // catalogs' empty-id short-circuit).
  const hasAiAncestor = useMemo(
    () => ancestorNodes.some((n) => n.provider === AI_PROVIDER_ID),
    [ancestorNodes],
  );
  const aiActions = useAiActions(hasAiAncestor);

  const upstreamProviderIds = useMemo(() => {
    const set = new Set<string>();
    for (const node of ancestorNodes) {
      if (node.kind === "action" && !isConnectionlessProvider(node.provider)) {
        set.add(node.provider);
      }
    }
    return [...set];
  }, [ancestorNodes]);

  // 3. Stable-profile multi-provider catalog loader. ONE hook,
  //    regardless of how many providers the current node depends on.
  const providerCatalogs = useProviderActionsForProviders(upstreamProviderIds);

  // 3b. Slice 3.10 — provider-trigger catalog.
  //
  // A workflow has at most one trigger node (single-trigger invariant
  // enforced in graphSlice.addTrigger), so the upstream set contains
  // at most one provider trigger. That makes a single-provider
  // `useProviderTriggers(provider)` call sufficient — no fan-out hook
  // needed, no Rules-of-Hooks risk across renders. `null` signals
  // "current node has no provider-trigger ancestor right now"; the
  // hook short-circuits to an idle state and never fetches.
  const upstreamTriggerProvider = useMemo<string | null>(() => {
    for (const node of ancestorNodes) {
      if (node.kind === "trigger" && !isConnectionlessProvider(node.provider)) {
        return node.provider;
      }
    }
    return null;
  }, [ancestorNodes]);
  const providerTriggers = useProviderTriggers(upstreamTriggerProvider);

  /**
   * TYPEFORM-DYNAMIC-OUTPUTS-UI-AND-AGENT-CLOSEOUT-1 — schema-dependent trigger outputs.
   *
   * A workflow has at most ONE trigger (the single-trigger invariant graphSlice enforces), so one
   * unconditional hook call covers every case and the hook profile stays fixed. This is the SINGLE
   * place dynamic outputs enter the builder: both variable pickers, both Data Maps and every
   * config-field selector read `sources` from this hook, so wiring it here is what satisfies "one
   * merged output source" — there is no per-surface implementation to keep in step.
   */
  const upstreamTriggerNode = useMemo(
    () => ancestorNodes.find((n) => n.kind === "trigger") ?? null,
    [ancestorNodes],
  );
  const upstreamTriggerMeta = useMemo(() => {
    if (!upstreamTriggerNode) return undefined;
    const key = `${upstreamTriggerNode.provider}:${upstreamTriggerNode.type}`;
    return (
      findProviderTriggerByKey(providerTriggers.triggers, key) ??
      findNativeTriggerByKey(nativeTriggers.triggers, key)
    );
  }, [upstreamTriggerNode, providerTriggers.triggers, nativeTriggers.triggers]);

  const dynamicTriggerOutputs = useDynamicTriggerOutputs({
    meta: upstreamTriggerMeta,
    config: upstreamTriggerNode?.config,
    ...(upstreamTriggerNode ? { nodeId: upstreamTriggerNode.id } : {}),
  });

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
        aiActions: aiActions.actions,
        providerCatalogs: providerCatalogs.byProvider,
        providerTriggers: providerTriggers.triggers,
      });
      if (!meta) continue; // not loaded yet, or unknown — skip silently
      // The trigger's outputs may be EXTENDED by its selected configuration (e.g. a chosen form's
      // questions). Actions keep their static outputs; the merger returns the static array by
      // reference when nothing synthesizes, so this is free for every other trigger.
      const outputs =
        node.kind === "trigger" && node.id === upstreamTriggerNode?.id
          ? dynamicTriggerOutputs.outputs
          : meta.outputs;
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
        aiActions.loading ||
        providerCatalogs.loading ||
        providerTriggers.loading ||
        dynamicTriggerOutputs.status === "loading",
      latestValuesBySource,
      dynamicTriggerOutputs,
    };
  }, [
    currentNodeId,
    ancestorNodes,
    nativeActions.actions,
    nativeActions.loading,
    nativeTriggers.triggers,
    nativeTriggers.loading,
    aiActions.actions,
    aiActions.loading,
    providerCatalogs.byProvider,
    providerCatalogs.loading,
    providerTriggers.triggers,
    providerTriggers.loading,
    latestValuesBySource,
    upstreamTriggerNode,
    dynamicTriggerOutputs,
  ]);
}

interface ResolvedMeta {
  displayName: string;
  outputs: readonly OutputMeta[];
}

interface ResolveCtx {
  nativeActions: readonly ActionMeta[];
  nativeTriggers: readonly TriggerMeta[];
  aiActions: readonly ActionMeta[];
  providerCatalogs: Readonly<Record<string, readonly ActionMeta[]>>;
  /**
   * Slice 3.10 — provider trigger catalog for the (at-most-one) upstream
   * provider-trigger node. Empty array means "no provider-trigger
   * ancestor for the current node" OR "catalog hasn't resolved yet."
   */
  providerTriggers: readonly TriggerMeta[];
}

function resolveMeta(
  node: {
    kind: "trigger" | "action";
    provider: string;
    type: string;
    config: Record<string, unknown>;
  },
  ctx: ResolveCtx,
): ResolvedMeta | undefined {
  if (!node.type) return undefined;
  const key = `${node.provider}:${node.type}`;
  if (node.kind === "trigger") {
    if (isConnectionlessProvider(node.provider)) {
      const trigMeta = findNativeTriggerByKey(ctx.nativeTriggers, key);
      if (!trigMeta) return undefined;
      return {
        displayName: trigMeta.displayName,
        outputs: trigMeta.payloadShape,
      };
    }
    // Slice 3.10 — provider triggers now resolve through the same
    // payloadShape contract as native triggers. The trigger's
    // `payloadShape` is exposed under the canonical `"trigger"` alias
    // by the caller (sourceId assignment).
    const trigMeta = findProviderTriggerByKey(ctx.providerTriggers, key);
    if (!trigMeta) return undefined;
    return {
      displayName: trigMeta.displayName,
      outputs: trigMeta.payloadShape,
    };
  }
  // CS-8 — every action branch resolves through `applyDynamicOutputs`:
  // metas without a `dynamicOutputs` declaration return `meta.outputs` by
  // reference (zero cost), metas WITH one get the author's committed
  // schema fields attached as child outputs. Metadata-driven — no
  // provider special-case.
  if (node.provider === AI_PROVIDER_ID) {
    const m = findAiActionByKey(ctx.aiActions, key);
    return m ? resolveActionOutputs(m, node.config) : undefined;
  }
  if (isConnectionlessProvider(node.provider)) {
    const m = findNativeActionByKey(ctx.nativeActions, key);
    return m ? resolveActionOutputs(m, node.config) : undefined;
  }
  const providerActions = ctx.providerCatalogs[node.provider] ?? [];
  const m = findProviderActionByKey(providerActions, key);
  return m ? resolveActionOutputs(m, node.config) : undefined;
}

function resolveActionOutputs(
  meta: ActionMeta,
  config: Record<string, unknown>,
): ResolvedMeta {
  return {
    displayName: meta.displayName,
    outputs: applyDynamicOutputs(meta, config),
  };
}
