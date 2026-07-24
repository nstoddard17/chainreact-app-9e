"use client";

import { useMemo } from "react";
import type { FieldMeta } from "@/contracts/actionMeta";
import type { WorkflowNode } from "@/contracts/workflow";
import {
  AI_PROVIDER_ID,
  isConnectionlessProvider,
} from "@/core/integrations/connectionlessProviders";
import { findAiActionByKey, useAiActions } from "./useAiActions";
import { findNativeActionByKey, useNativeActions } from "./useNativeActions";
import { findNativeTriggerByKey, useNativeTriggers } from "./useNativeTriggers";
import { findProviderActionByKey, useProviderActions } from "./useProviderActions";
import { findProviderTriggerByKey, useProviderTriggers } from "./useProviderTriggers";

/**
 * 5.DUAL-BUILDER-1 CS-2 — resolve one node's full field metadata through the
 * SAME four cached catalog hooks the config rail uses (ConfigModalShell's
 * `(kind, provider)` lookup, extracted for a second consumer: the Document
 * Guided Stop needs the real `FieldMeta` — sensitivity, dependsOn,
 * optionsSource, visibleWhen, advanced — to re-host a single field honestly).
 *
 * NOT a parallel metadata system: same fetchers, same caches, same find
 * helpers; per-branch loading/error so one slow source never blocks another
 * node's lookup.
 */

export interface NodeMetaResult {
  readonly meta:
    | {
        readonly key: string;
        readonly displayName: string;
        readonly description: string;
        readonly fields: readonly FieldMeta[];
        readonly requiresIntegration: boolean;
      }
    | undefined;
  readonly loading: boolean;
  readonly error: string | null;
}

export function useNodeMeta(node: WorkflowNode | undefined): NodeMetaResult {
  const nativeActions = useNativeActions();
  const nativeTriggers = useNativeTriggers();
  // Only fetch the AI catalog when THIS node is an AI node (mirrors the
  // provider-catalog hooks' null short-circuit — no fetch otherwise).
  const aiActions = useAiActions(node?.provider === AI_PROVIDER_ID);

  // Connectionless providers (native, ai) serve their metadata from their own
  // catalogs — the provider-catalog hooks are for connection-backed apps only.
  const providerActionSource =
    node &&
    node.kind === "action" &&
    !isConnectionlessProvider(node.provider) &&
    node.type
      ? node.provider
      : null;
  const providerActions = useProviderActions(providerActionSource);

  const providerTriggerSource =
    node &&
    node.kind === "trigger" &&
    !isConnectionlessProvider(node.provider) &&
    node.type
      ? node.provider
      : null;
  const providerTriggers = useProviderTriggers(providerTriggerSource);

  return useMemo<NodeMetaResult>(() => {
    if (!node || !node.type) return { meta: undefined, loading: false, error: null };
    const key = `${node.provider}:${node.type}`;
    // The AI provider ships actions only (no AI triggers exist).
    if (node.provider === AI_PROVIDER_ID) {
      return {
        meta:
          node.kind === "action"
            ? findAiActionByKey(aiActions.actions, key)
            : undefined,
        loading: aiActions.loading,
        error: aiActions.error,
      };
    }
    if (isConnectionlessProvider(node.provider)) {
      const source = node.kind === "trigger" ? nativeTriggers : nativeActions;
      const meta =
        node.kind === "trigger"
          ? findNativeTriggerByKey(nativeTriggers.triggers, key)
          : findNativeActionByKey(nativeActions.actions, key);
      return { meta, loading: source.loading, error: source.error };
    }
    if (node.kind === "action") {
      return {
        meta: findProviderActionByKey(providerActions.actions, key),
        loading: providerActions.loading,
        error: providerActions.error,
      };
    }
    return {
      meta: findProviderTriggerByKey(providerTriggers.triggers, key),
      loading: providerTriggers.loading,
      error: providerTriggers.error,
    };
  }, [node, nativeActions, nativeTriggers, aiActions, providerActions, providerTriggers]);
}
