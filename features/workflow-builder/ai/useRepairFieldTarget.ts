"use client";

import { useMemo } from "react";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { isRequiredValueMissing } from "@/core/workflows/requiredFields";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";
import {
  findNativeActionByKey,
  useNativeActions,
} from "../hooks/useNativeActions";
import {
  findNativeTriggerByKey,
  useNativeTriggers,
} from "../hooks/useNativeTriggers";
import {
  findProviderActionByKey,
  useProviderActions,
} from "../hooks/useProviderActions";
import {
  findProviderTriggerByKey,
  useProviderTriggers,
} from "../hooks/useProviderTriggers";

/**
 * Slice 4.AI-CONFIG-ASSIST CS-4 — resolve the FIRST still-empty required field of
 * a diagnosed node, for the direct "Open <field> field" affordance on a repair
 * proposal.
 *
 * The repair diagnosis names the node (`firstMissingFieldNodeId`) but exposes the
 * missing field only as a LABEL — the config-rail highlight needs the field KEY.
 * This resolves the node's action/trigger metadata client-side (the SAME hooks +
 * find-by-key helpers `useChatFillTarget` / `ConfigModalShell` use) and returns
 * the first required field that is currently empty in the live draft, with both
 * the key (target) and label (display copy). Returns null when the node isn't on
 * the canvas, its metadata isn't loaded, or it has no empty required field
 * (e.g. the user already filled it) — the caller then keeps the "Preview fix" path.
 *
 * Read-only: resolves metadata + the live value; NEVER writes, saves, runs, or
 * mutates the graph. `nodeId` / `fieldKey` are internal navigation targets;
 * `nodeLabel` / `fieldLabel` are display copy. `initialValues` is the live node
 * config, threaded into `revealNode` so the rail opens against the real draft.
 */

const NATIVE_PROVIDER = "native";

export interface RepairFieldTarget {
  readonly nodeId: string;
  readonly fieldKey: string;
  readonly fieldLabel: string;
  readonly nodeLabel: string;
  /** Live pending config for the node — passed to `revealNode` as initialValues. */
  readonly initialValues: Readonly<Record<string, unknown>>;
}

export function useRepairFieldTarget(
  nodeId: string | null,
): RepairFieldTarget | null {
  const drafts = useConfigSlice((s) => s.drafts);
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);

  const node = useMemo(
    () => (nodeId ? pendingNodes.find((n) => n.id === nodeId) : undefined),
    [nodeId, pendingNodes],
  );

  // Mirror ConfigModalShell / useChatFillTarget: only load the source the node needs.
  const providerActionProvider =
    node && node.kind === "action" && node.provider !== NATIVE_PROVIDER && node.type
      ? node.provider
      : null;
  const providerTriggerProvider =
    node && node.kind === "trigger" && node.provider !== NATIVE_PROVIDER && node.type
      ? node.provider
      : null;

  const nativeActions = useNativeActions();
  const nativeTriggers = useNativeTriggers();
  const providerActions = useProviderActions(providerActionProvider);
  const providerTriggers = useProviderTriggers(providerTriggerProvider);

  const meta = useMemo(() => {
    if (!node || !node.type) return undefined;
    const key = `${node.provider}:${node.type}`;
    if (node.provider === NATIVE_PROVIDER) {
      return node.kind === "trigger"
        ? findNativeTriggerByKey(nativeTriggers.triggers, key)
        : findNativeActionByKey(nativeActions.actions, key);
    }
    return node.kind === "action"
      ? findProviderActionByKey(providerActions.actions, key)
      : findProviderTriggerByKey(providerTriggers.triggers, key);
  }, [node, nativeActions.actions, nativeTriggers.triggers, providerActions.actions, providerTriggers.triggers]);

  return useMemo<RepairFieldTarget | null>(() => {
    if (!node || !nodeId || !meta) return null;

    // Live value: prefer the in-progress draft (e.g. if chat-fill already staged a
    // value), else the pending node config. Mirrors the readiness/diagnosis verdict.
    const draftValues = drafts[nodeId]?.values;
    const valueFor = (name: string): unknown =>
      draftValues && name in draftValues ? draftValues[name] : node.config[name];

    const missing = meta.fields.find(
      (f) => f.required && isRequiredValueMissing(valueFor(f.name)),
    );
    if (!missing) return null;

    const nodeLabel = getNodeDisplayName(
      {
        kind: node.kind,
        provider: node.provider,
        type: node.type,
        ...(node.displayName ? { displayName: node.displayName } : {}),
      },
      { displayName: meta.displayName },
    );

    return {
      nodeId,
      fieldKey: missing.name,
      // Display label only — never the raw field key (no-leak).
      fieldLabel: missing.label,
      nodeLabel,
      initialValues: node.config,
    };
  }, [node, nodeId, meta, drafts]);
}
