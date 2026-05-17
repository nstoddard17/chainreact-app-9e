"use client";

import { useState } from "react";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import { useGraphSlice } from "../state/graphSlice";
import { useNativeActions } from "../hooks/useNativeActions";
import { useNativeTriggers } from "../hooks/useNativeTriggers";
import { ActionPicker } from "./ActionPicker";
import { TriggerPicker } from "./TriggerPicker";

export interface ProviderOption {
  id: string;
  displayName: string;
}

interface Props {
  triggerProviders: readonly ProviderOption[];
  actionProviders: readonly ProviderOption[];
}

type OpenMenu = "trigger" | "action" | null;

/**
 * Picker for adding a trigger or action node.
 *
 * Slice 3.4 — `AddNodeMenu` is now the top-level toggle shell. The
 * trigger / action picker bodies live in `TriggerPicker.tsx` and
 * `ActionPicker.tsx` so each can own its own state (provider drill-in,
 * loading / error) without bloating this file past the 300-line
 * target.
 *
 * Behavior summary:
 *   - Trigger picker (Slice 3.3): Native triggers from metadata +
 *     provider triggers from the bare `addTrigger({provider})` path.
 *     Provider-trigger wrappers are deferred (see Slice 3.4 brief).
 *   - Action picker (Slice 3.4): Native + Providers. Picking a
 *     provider drills into that provider's action list (via
 *     `useProviderActions`). Picking ANY action — native or provider
 *     — dispatches `addActionFromMeta` with metadata-derived defaults.
 *     The legacy bare `addAction({provider})` path is no longer
 *     reachable through this UI (the slice action stays exported so
 *     tests + future surfaces can still use it directly).
 */
export function AddNodeMenu({ triggerProviders, actionProviders }: Props) {
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const addTrigger = useGraphSlice((s) => s.addTrigger);
  const addActionFromMeta = useGraphSlice((s) => s.addActionFromMeta);
  const addTriggerFromMeta = useGraphSlice((s) => s.addTriggerFromMeta);
  const [open, setOpen] = useState<OpenMenu>(null);

  const nativeActions = useNativeActions();
  const nativeTriggers = useNativeTriggers();

  const hasTrigger = pendingNodes.some((n) => n.kind === "trigger");

  function handleAddProviderTrigger(provider: ProviderOption) {
    addTrigger({ provider: provider.id });
    setOpen(null);
  }

  function handleAddNativeTrigger(meta: TriggerMeta) {
    addTriggerFromMeta(meta);
    setOpen(null);
  }

  function handlePickAction(meta: ActionMeta) {
    addActionFromMeta(meta);
    setOpen(null);
  }

  return (
    <div className="flex flex-col gap-2" aria-label="Add node">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(open === "trigger" ? null : "trigger")}
          disabled={hasTrigger}
          title={
            hasTrigger
              ? "Workflow already has a trigger. Remove it first."
              : undefined
          }
          className="rounded border border-input px-3 py-1.5 text-sm disabled:opacity-60"
        >
          + Add trigger
        </button>
        <button
          type="button"
          onClick={() => setOpen(open === "action" ? null : "action")}
          disabled={!hasTrigger}
          title={!hasTrigger ? "Add a trigger before adding actions." : undefined}
          className="rounded border border-input px-3 py-1.5 text-sm disabled:opacity-60"
        >
          + Add action
        </button>
      </div>
      {open === "trigger" && (
        <TriggerPicker
          nativeTriggers={nativeTriggers.triggers}
          nativeLoading={nativeTriggers.loading}
          nativeError={nativeTriggers.error}
          triggerProviders={triggerProviders}
          onPickNative={handleAddNativeTrigger}
          onPickProvider={handleAddProviderTrigger}
        />
      )}
      {open === "action" && (
        <ActionPicker
          nativeActions={nativeActions.actions}
          nativeLoading={nativeActions.loading}
          nativeError={nativeActions.error}
          actionProviders={actionProviders}
          onPickAction={handlePickAction}
        />
      )}
    </div>
  );
}
