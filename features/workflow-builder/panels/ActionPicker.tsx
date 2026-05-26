"use client";

import { useState } from "react";
import type { ActionMeta } from "@/contracts/actionMeta";
import { useProviderActions } from "../hooks/useProviderActions";
import type { ProviderOption } from "./AddNodePanel";
import { ProviderChipIcon, filterMetasBySearch } from "./_pickerShared";

/**
 * Action picker — Slice 3.4 drill-in.
 *
 * Two view modes:
 *   - **List mode (default):** Native section (sourced from props) +
 *     Providers section (flat list of provider buttons).
 *   - **Provider mode:** entered by clicking a provider button. Shows
 *     that provider's actions via `useProviderActions(provider.id)`,
 *     plus a "← Back" affordance to return to list mode.
 *
 * Picking ANY action (native or provider) dispatches the supplied
 * `onPickAction(meta)` callback — same code path for both, since both
 * resolve through `graphSlice.addActionFromMeta`. Slice 3.2's
 * bare-provider add path (`addAction({provider})`) is no longer
 * surfaced here: every action now ships with metadata, and providers
 * without metadata yet render an empty-state hint inside their drill-in.
 *
 * Per docs/rules/workflow-builder-ui.md: presentational + delegating.
 * The picker does NOT call typed-client functions directly — that's
 * the hook's job.
 *
 * Slice 4.BUILDER-ADD-FLOW-1 adds two additive optional props consumed
 * by `AddNodePanel`: `searchQuery` (case-insensitive filter against
 * displayName + description for native + drilled-in lists) and
 * `providerIcons` (provider id → SVG URL, rendered next to provider
 * chips + in the drill-in header). Defaults preserve pre-slice
 * behavior so the standalone ActionPicker tests stay green.
 */

export interface ActionPickerProps {
  nativeActions: readonly ActionMeta[];
  nativeLoading: boolean;
  nativeError: string | null;
  actionProviders: readonly ProviderOption[];
  /** Fired when the user picks any action (native or provider). */
  onPickAction: (meta: ActionMeta) => void;
  /**
   * Slice 4.BUILDER-ADD-FLOW-1 — optional case-insensitive query.
   * Filters the native list and (when drilled in) the per-provider list
   * by `displayName + description` match. Provider chips stay visible
   * regardless so users can still discover providers whose label
   * doesn't match.
   */
  searchQuery?: string;
  /**
   * Slice 4.BUILDER-ADD-FLOW-1 — optional map of provider id → SVG icon
   * URL (from `providerIconUrl()` in the registry). When present,
   * provider chips render the icon next to the label and the drill-in
   * header shows the icon next to the provider name.
   */
  providerIcons?: Readonly<Record<string, string>>;
}

export function ActionPicker({
  nativeActions,
  nativeLoading,
  nativeError,
  actionProviders,
  onPickAction,
  searchQuery,
  providerIcons,
}: ActionPickerProps) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(
    null,
  );

  if (selectedProvider) {
    return (
      <ProviderActionsView
        provider={selectedProvider}
        providerIcons={providerIcons}
        searchQuery={searchQuery}
        onBack={() => setSelectedProvider(null)}
        onPick={onPickAction}
      />
    );
  }

  const filteredNative = filterMetasBySearch(nativeActions, searchQuery);

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
        ) : filteredNative.length === 0 && searchQuery ? (
          <p className="text-xs text-muted-foreground">No matches in native actions.</p>
        ) : (
          <ul aria-label="Native actions list" className="flex flex-col gap-1">
            {filteredNative.map((meta) => (
              <li key={meta.key}>
                <button
                  type="button"
                  onClick={() => onPickAction(meta)}
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
        {actionProviders.length === 0 ? (
          <p className="text-xs text-muted-foreground">No action providers available.</p>
        ) : (
          <ul aria-label="Action providers" className="flex flex-wrap gap-2">
            {actionProviders.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedProvider(p)}
                  aria-label={`Browse ${p.displayName} actions`}
                  className="inline-flex items-center gap-1.5 rounded bg-muted px-3 py-1 text-sm"
                >
                  <ProviderChipIcon
                    providerId={p.id}
                    label={p.displayName}
                    iconUrl={providerIcons?.[p.id]}
                  />
                  {p.displayName}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface ProviderActionsViewProps {
  provider: ProviderOption;
  providerIcons?: Readonly<Record<string, string>>;
  searchQuery?: string;
  onBack: () => void;
  onPick: (meta: ActionMeta) => void;
}

function ProviderActionsView({
  provider,
  providerIcons,
  searchQuery,
  onBack,
  onPick,
}: ProviderActionsViewProps) {
  const { actions, loading, error } = useProviderActions(provider.id);
  const filtered = filterMetasBySearch(actions, searchQuery);

  return (
    <section
      className="flex flex-col gap-3 rounded border border-input p-3"
      aria-label={`${provider.displayName} actions`}
    >
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to action picker"
          className="rounded border border-input px-2 py-0.5 text-xs"
        >
          ← Back
        </button>
        <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <ProviderChipIcon
            providerId={provider.id}
            label={provider.displayName}
            iconUrl={providerIcons?.[provider.id]}
          />
          {provider.displayName}
        </h3>
      </header>
      {loading ? (
        <p className="text-xs text-muted-foreground">
          Loading {provider.displayName} actions…
        </p>
      ) : error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : actions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {provider.displayName} hasn&rsquo;t shipped action metadata yet.
          Configurable actions arrive in a later slice.
        </p>
      ) : filtered.length === 0 && searchQuery ? (
        <p className="text-xs text-muted-foreground">
          No matches in {provider.displayName} actions.
        </p>
      ) : (
        <ul
          aria-label={`${provider.displayName} actions list`}
          className="flex flex-col gap-1"
        >
          {filtered.map((meta) => (
            <li key={meta.key}>
              <button
                type="button"
                onClick={() => onPick(meta)}
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
  );
}
