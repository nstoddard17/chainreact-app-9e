"use client";

import { useState } from "react";
import type { ActionMeta } from "@/contracts/actionMeta";
import { useGraphSlice } from "../state/graphSlice";
import { useNativeActions } from "../hooks/useNativeActions";

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
 * Slice 3.2 extends the action picker with a "Native" section sourced
 * from `useNativeActions()` (discovery API → typed client). Selecting a
 * native action creates a fully-typed node via `addActionFromMeta`,
 * including default config derived from the meta's field defaults.
 *
 * Provider-action picking keeps the existing Slice 1I.2 behavior (a
 * node with `type=""` and empty config) — proper provider-action
 * pickers land in Slice 3.4 per-provider config wrappers.
 */
export function AddNodeMenu({ triggerProviders, actionProviders }: Props) {
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const addTrigger = useGraphSlice((s) => s.addTrigger);
  const addAction = useGraphSlice((s) => s.addAction);
  const addActionFromMeta = useGraphSlice((s) => s.addActionFromMeta);
  const [open, setOpen] = useState<OpenMenu>(null);

  const nativeActions = useNativeActions();

  const hasTrigger = pendingNodes.some((n) => n.kind === "trigger");

  function handleAddTrigger(provider: ProviderOption) {
    addTrigger({ provider: provider.id });
    setOpen(null);
  }

  function handleAddProviderAction(provider: ProviderOption) {
    addAction({ provider: provider.id });
    setOpen(null);
  }

  function handleAddNativeAction(meta: ActionMeta) {
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
        <ProviderList
          aria-label="Trigger providers"
          providers={triggerProviders}
          onPick={handleAddTrigger}
          emptyMessage="No trigger providers available."
        />
      )}
      {open === "action" && (
        <ActionPicker
          nativeActions={nativeActions.actions}
          nativeLoading={nativeActions.loading}
          nativeError={nativeActions.error}
          actionProviders={actionProviders}
          onPickNative={handleAddNativeAction}
          onPickProvider={handleAddProviderAction}
        />
      )}
    </div>
  );
}

interface ActionPickerProps {
  nativeActions: readonly ActionMeta[];
  nativeLoading: boolean;
  nativeError: string | null;
  actionProviders: readonly ProviderOption[];
  onPickNative: (meta: ActionMeta) => void;
  onPickProvider: (provider: ProviderOption) => void;
}

function ActionPicker({
  nativeActions,
  nativeLoading,
  nativeError,
  actionProviders,
  onPickNative,
  onPickProvider,
}: ActionPickerProps) {
  return (
    <div className="flex flex-col gap-3 rounded border border-input p-3">
      <section aria-label="Native actions" className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Native
        </h3>
        {nativeLoading ? (
          <p className="text-xs text-muted-foreground">Loading native actions…</p>
        ) : nativeError ? (
          <p role="alert" className="text-xs text-destructive">
            {nativeError}
          </p>
        ) : nativeActions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No native actions available.</p>
        ) : (
          <ul aria-label="Native actions list" className="flex flex-col gap-1">
            {nativeActions.map((meta) => (
              <li key={meta.key}>
                <button
                  type="button"
                  onClick={() => onPickNative(meta)}
                  className="flex w-full flex-col gap-0.5 rounded border border-transparent bg-muted/50 px-3 py-2 text-left hover:border-input hover:bg-muted"
                >
                  <span className="text-sm font-medium">{meta.displayName}</span>
                  <span className="text-xs text-muted-foreground line-clamp-2">
                    {meta.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Provider actions" className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Providers
        </h3>
        <ProviderList
          aria-label="Action providers"
          providers={actionProviders}
          onPick={onPickProvider}
          emptyMessage="No action providers available."
        />
      </section>
    </div>
  );
}

interface ProviderListProps {
  providers: readonly ProviderOption[];
  onPick: (provider: ProviderOption) => void;
  emptyMessage: string;
  "aria-label": string;
}

function ProviderList({
  providers,
  onPick,
  emptyMessage,
  ...rest
}: ProviderListProps) {
  if (providers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{emptyMessage}</p>
    );
  }
  return (
    <ul aria-label={rest["aria-label"]} className="flex flex-wrap gap-2">
      {providers.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onPick(p)}
            className="rounded bg-muted px-3 py-1 text-sm"
          >
            {p.displayName}
          </button>
        </li>
      ))}
    </ul>
  );
}
