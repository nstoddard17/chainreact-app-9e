"use client";

import { useState } from "react";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import { useProviderTriggers } from "../hooks/useProviderTriggers";
import type { ProviderOption } from "./AddNodePanel";
import { ProviderChipIcon, filterMetasBySearch } from "./_pickerShared";

/**
 * Trigger picker — Slice 3.3 surface; extended in Slice 3.4 (sibling
 * to ActionPicker); extended in Slice 3.10 with the provider drill-in.
 *
 * Two view modes (mirroring ActionPicker):
 *   - **List mode (default):** Native section (sourced from props) +
 *     Providers section (flat list of provider buttons).
 *   - **Provider mode:** entered by clicking a provider button. Shows
 *     that provider's triggers via `useProviderTriggers(provider.id)`,
 *     plus a "← Back" affordance to return to list mode.
 *
 * Picking ANY trigger (native or provider) dispatches the supplied
 * callback. The legacy bare-add path
 * (`addTrigger({provider: provider.id})`) is no longer surfaced
 * through this UI — providers without registered trigger metadata
 * yet render an empty-state hint inside their drill-in, exactly like
 * ActionPicker does for actions. The slice action stays exported on
 * graphSlice for tests + future surfaces, but the UI now always
 * routes through `addTriggerFromMeta(meta)`.
 *
 * Per docs/rules/workflow-builder-ui.md: presentational + delegating.
 * The picker does NOT call typed-client functions directly — that's
 * the hook's job. The component knows only about TriggerMeta + the
 * picked-callback contract.
 */

export interface TriggerPickerProps {
  nativeTriggers: readonly TriggerMeta[];
  nativeLoading: boolean;
  nativeError: string | null;
  triggerProviders: readonly ProviderOption[];
  onPickNative: (meta: TriggerMeta) => void;
  /** Slice 3.10 — fired when the user picks a provider trigger from the drill-in. */
  onPickProviderTrigger: (meta: TriggerMeta) => void;
  /**
   * Slice 4.BUILDER-ADD-FLOW-1 — optional case-insensitive query used by
   * the searchable `AddNodePanel`. Filters the native list and (when
   * drilled into a provider) the per-provider list by
   * `displayName + description` match. Provider chips stay visible so
   * the user can still discover providers whose label doesn't match.
   * Default behavior unchanged when omitted.
   */
  searchQuery?: string;
  /**
   * Slice 4.BUILDER-ADD-FLOW-1 — optional map of provider id → SVG icon
   * URL (from `providerIconUrl()` in the registry). When present, the
   * provider chips render the icon next to the label and the drill-in
   * header shows the icon next to the provider name. Absent providers
   * keep text-only chips.
   */
  providerIcons?: Readonly<Record<string, string>>;
}

export function TriggerPicker({
  nativeTriggers,
  nativeLoading,
  nativeError,
  triggerProviders,
  onPickNative,
  onPickProviderTrigger,
  searchQuery,
  providerIcons,
}: TriggerPickerProps) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(
    null,
  );

  if (selectedProvider) {
    return (
      <ProviderTriggersView
        provider={selectedProvider}
        providerIcons={providerIcons}
        searchQuery={searchQuery}
        onBack={() => setSelectedProvider(null)}
        onPick={onPickProviderTrigger}
      />
    );
  }

  const filteredNative = filterMetasBySearch(nativeTriggers, searchQuery);

  return (
    <div className="flex flex-col gap-3 rounded border border-input p-3">
      <section aria-label="Native triggers" className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Native
        </h3>
        {nativeLoading ? (
          <p className="text-xs text-muted-foreground">Loading native triggers…</p>
        ) : nativeError ? (
          <p role="alert" className="text-xs text-destructive">
            {nativeError}
          </p>
        ) : nativeTriggers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No native triggers available.</p>
        ) : filteredNative.length === 0 && searchQuery ? (
          <p className="text-xs text-muted-foreground">No matches in native triggers.</p>
        ) : (
          <ul aria-label="Native triggers list" className="flex flex-col gap-1">
            {filteredNative.map((meta) => (
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
      <section aria-label="Provider triggers" className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Providers
        </h3>
        {triggerProviders.length === 0 ? (
          <p className="text-xs text-muted-foreground">No trigger providers available.</p>
        ) : (
          <ul aria-label="Trigger providers" className="flex flex-wrap gap-2">
            {triggerProviders.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedProvider(p)}
                  aria-label={`Browse ${p.displayName} triggers`}
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

interface ProviderTriggersViewProps {
  provider: ProviderOption;
  providerIcons?: Readonly<Record<string, string>>;
  searchQuery?: string;
  onBack: () => void;
  onPick: (meta: TriggerMeta) => void;
}

function ProviderTriggersView({
  provider,
  providerIcons,
  searchQuery,
  onBack,
  onPick,
}: ProviderTriggersViewProps) {
  const { triggers, loading, error } = useProviderTriggers(provider.id);
  const filtered = filterMetasBySearch(triggers, searchQuery);

  return (
    <section
      className="flex flex-col gap-3 rounded border border-input p-3"
      aria-label={`${provider.displayName} triggers`}
    >
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to trigger picker"
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
          Loading {provider.displayName} triggers…
        </p>
      ) : error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : triggers.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {provider.displayName} hasn&rsquo;t shipped trigger metadata yet.
          Configurable triggers arrive in a later slice.
        </p>
      ) : filtered.length === 0 && searchQuery ? (
        <p className="text-xs text-muted-foreground">
          No matches in {provider.displayName} triggers.
        </p>
      ) : (
        <ul
          aria-label={`${provider.displayName} triggers list`}
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
