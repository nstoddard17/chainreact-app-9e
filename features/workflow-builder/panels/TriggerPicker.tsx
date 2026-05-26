"use client";

import { useState } from "react";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import { useProviderTriggers } from "../hooks/useProviderTriggers";
import type { ProviderOption } from "./AddNodePanel";
import {
  PickerRow,
  PickerSectionHeader,
  ProviderCard,
  ProviderChipIcon,
  filterMetasBySearch,
} from "./_pickerShared";

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
    <div className="flex flex-col gap-3">
      <section aria-label="Native triggers" className="flex flex-col gap-1.5">
        <PickerSectionHeader label="Native triggers" count={filteredNative.length} />
        {nativeLoading ? (
          <p
            className="px-2 text-[11.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            Loading native triggers…
          </p>
        ) : nativeError ? (
          <p
            role="alert"
            className="px-2 text-[11.5px]"
            style={{ color: "var(--builder-danger)" }}
          >
            {nativeError}
          </p>
        ) : nativeTriggers.length === 0 ? (
          <p
            className="px-2 text-[11.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            No native triggers available.
          </p>
        ) : filteredNative.length === 0 && searchQuery ? (
          <p
            className="px-2 text-[11.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            No matches in native triggers.
          </p>
        ) : (
          <ul
            aria-label="Native triggers list"
            className="flex flex-col overflow-hidden rounded-[5px]"
            style={{ border: "1px solid var(--builder-border)" }}
          >
            {filteredNative.map((meta, i) => (
              <li
                key={meta.key}
                style={{
                  borderBottom:
                    i === filteredNative.length - 1
                      ? "0"
                      : "1px solid var(--builder-border)",
                }}
              >
                <PickerRow
                  title={meta.displayName}
                  description={meta.description}
                  metaKey={meta.key}
                  onClick={() => onPickNative(meta)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Provider triggers" className="flex flex-col gap-1.5">
        <PickerSectionHeader label="Providers" count={triggerProviders.length} />
        {triggerProviders.length === 0 ? (
          <p
            className="px-2 text-[11.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            No trigger providers available.
          </p>
        ) : (
          <ul
            aria-label="Trigger providers"
            className="grid grid-cols-2 gap-1.5"
          >
            {triggerProviders.map((p) => (
              <li key={p.id}>
                <ProviderCard
                  providerId={p.id}
                  label={p.displayName}
                  iconUrl={providerIcons?.[p.id]}
                  onClick={() => setSelectedProvider(p)}
                  ariaLabel={`Browse ${p.displayName} triggers`}
                />
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
      className="flex flex-col gap-2"
      aria-label={`${provider.displayName} triggers`}
    >
      <header className="flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to trigger picker"
          className="inline-flex h-6 w-6 items-center justify-center rounded-[4px]"
          style={{
            background: "transparent",
            color: "var(--builder-muted)",
            border: "1px solid var(--builder-border)",
          }}
          title="Back"
        >
          ←
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <ProviderChipIcon
            providerId={provider.id}
            label={provider.displayName}
            iconUrl={providerIcons?.[provider.id]}
          />
          <span
            className="truncate text-[13px] font-semibold"
            style={{ color: "var(--builder-text)" }}
          >
            {provider.displayName}
          </span>
          <span
            className="builder-mono text-[10.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            · triggers
          </span>
        </div>
      </header>
      {loading ? (
        <p
          className="px-2 text-[11.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          Loading {provider.displayName} triggers…
        </p>
      ) : error ? (
        <p
          role="alert"
          className="px-2 text-[11.5px]"
          style={{ color: "var(--builder-danger)" }}
        >
          {error}
        </p>
      ) : triggers.length === 0 ? (
        <p
          className="px-2 text-[11.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          {provider.displayName} hasn&rsquo;t shipped trigger metadata yet.
          Configurable triggers arrive in a later slice.
        </p>
      ) : filtered.length === 0 && searchQuery ? (
        <p
          className="px-2 text-[11.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          No matches in {provider.displayName} triggers.
        </p>
      ) : (
        <ul
          aria-label={`${provider.displayName} triggers list`}
          className="flex flex-col overflow-hidden rounded-[5px]"
          style={{ border: "1px solid var(--builder-border)" }}
        >
          {filtered.map((meta, i) => (
            <li
              key={meta.key}
              style={{
                borderBottom:
                  i === filtered.length - 1
                    ? "0"
                    : "1px solid var(--builder-border)",
              }}
            >
              <PickerRow
                title={meta.displayName}
                description={meta.description}
                metaKey={meta.key}
                onClick={() => onPick(meta)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
