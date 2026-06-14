"use client";

import { useMemo } from "react";
import type { FieldMeta } from "@/contracts/actionMeta";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
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
import { isChatFillEligible, type ChatFillEligibility } from "./chatFillEligibility";

/**
 * AI-CONFIG-ASSIST CS-3 — resolve the currently-highlighted chat-fill target.
 *
 * Reads the highlighted field (`configSlice.activeNodeId` + `focusFieldKey`, set
 * by the 2F "Open field" reveal), finds the live node in `graphSlice`, resolves
 * its action/trigger metadata client-side (the SAME hooks + find-by-key helpers
 * `ConfigModalShell` uses), and computes CS-1 eligibility. Returns `null` when no
 * field is highlighted.
 *
 * Read-only: resolves metadata + labels + the current draft value; never writes,
 * never mutates the graph. `nodeId` / `fieldKey` are internal targets; `nodeLabel`
 * / `fieldLabel` are for display copy.
 */

const NATIVE_PROVIDER = "native";

export interface ChatFillTarget {
  readonly nodeId: string;
  readonly fieldKey: string;
  /** Resolved FieldMeta, or undefined if the highlighted key isn't on the node's metadata. */
  readonly field: FieldMeta | undefined;
  /** Action-level risk flags (absent for triggers). */
  readonly action?: { readonly isDestructive: boolean; readonly requiresConfirmation: boolean };
  readonly nodeLabel: string;
  readonly fieldLabel: string;
  /** Current pending draft value for the field (for the before/after proposal). */
  readonly currentValue: unknown;
  readonly eligibility: ChatFillEligibility;
}

export function useChatFillTarget(): ChatFillTarget | null {
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);
  const focusFieldKey = useConfigSlice((s) => s.focusFieldKey);
  const drafts = useConfigSlice((s) => s.drafts);
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);

  const node = useMemo(
    () => (activeNodeId ? pendingNodes.find((n) => n.id === activeNodeId) : undefined),
    [activeNodeId, pendingNodes],
  );

  // Mirror ConfigModalShell: only load the source the active node needs.
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

  return useMemo<ChatFillTarget | null>(() => {
    if (!node || !activeNodeId || !focusFieldKey) return null;

    const field = meta?.fields.find((f) => f.name === focusFieldKey);
    // Action-level risk is only present on ActionMeta; triggers carry none.
    const action =
      meta && "isDestructive" in meta
        ? {
            isDestructive: meta.isDestructive,
            requiresConfirmation: meta.requiresConfirmation,
          }
        : undefined;
    const nodeLabel = getNodeDisplayName(
      { kind: node.kind, provider: node.provider, type: node.type, ...(node.displayName ? { displayName: node.displayName } : {}) },
      meta ? { displayName: meta.displayName } : null,
    );
    const currentValue = drafts[activeNodeId]?.values?.[focusFieldKey] ?? node.config[focusFieldKey];

    return {
      nodeId: activeNodeId,
      fieldKey: focusFieldKey,
      field,
      ...(action ? { action } : {}),
      nodeLabel,
      // Display label only — NEVER fall back to the raw field key (no-leak).
      fieldLabel: field?.label ?? "",
      currentValue,
      eligibility: isChatFillEligible({ field, action }),
    };
  }, [node, activeNodeId, focusFieldKey, meta, drafts]);
}
