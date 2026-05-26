"use client";

import { useState } from "react";
import type { ActionMeta } from "@/contracts/actionMeta";
import { useProviderActions } from "../hooks/useProviderActions";
import type { ProviderOption } from "./AddNodePanel";
import {
  PickerRow,
  PickerSectionHeader,
  ProviderCard,
  ProviderChipIcon,
  filterMetasBySearch,
} from "./_pickerShared";

/**
 * Action picker — Slice 3.4 drill-in (restyled in 4.BUILDER-DESIGN-PARITY-1).
 *
 * Two view modes:
 *   - **List mode (default):** Native actions list + Provider grid (2-col)
 *     in the Anthropic ChainV2 command-palette style.
 *   - **Provider mode:** entered by clicking a provider card. Shows that
 *     provider's actions via `useProviderActions(provider.id)`, plus a
 *     "← Back" affordance.
 *
 * Behavior contract unchanged: every native + provider action picks
 * through `onPickAction(meta)` → `addActionFromMeta` upstream. No
 * bare-add path is exposed. Test contracts (aria-labels on lists,
 * `Browse {provider} actions` button names, "Back to action picker")
 * are preserved verbatim.
 */

export interface ActionPickerProps {
  nativeActions: readonly ActionMeta[];
  nativeLoading: boolean;
  nativeError: string | null;
  actionProviders: readonly ProviderOption[];
  onPickAction: (meta: ActionMeta) => void;
  searchQuery?: string;
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
    <div className="flex flex-col gap-3">
      <section aria-label="Native actions" className="flex flex-col gap-1.5">
        <PickerSectionHeader label="Native actions" count={filteredNative.length} />
        {nativeLoading ? (
          <p
            className="px-2 text-[11.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            Loading native actions…
          </p>
        ) : nativeError ? (
          <p
            role="alert"
            className="px-2 text-[11.5px]"
            style={{ color: "var(--builder-danger)" }}
          >
            {nativeError}
          </p>
        ) : nativeActions.length === 0 ? (
          <p
            className="px-2 text-[11.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            No native actions available.
          </p>
        ) : filteredNative.length === 0 && searchQuery ? (
          <p
            className="px-2 text-[11.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            No matches in native actions.
          </p>
        ) : (
          <ul
            aria-label="Native actions list"
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
                  onClick={() => onPickAction(meta)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Provider actions" className="flex flex-col gap-1.5">
        <PickerSectionHeader label="Providers" count={actionProviders.length} />
        {actionProviders.length === 0 ? (
          <p
            className="px-2 text-[11.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            No action providers available.
          </p>
        ) : (
          <ul
            aria-label="Action providers"
            className="grid grid-cols-2 gap-1.5"
          >
            {actionProviders.map((p) => (
              <li key={p.id}>
                <ProviderCard
                  providerId={p.id}
                  label={p.displayName}
                  iconUrl={providerIcons?.[p.id]}
                  onClick={() => setSelectedProvider(p)}
                  ariaLabel={`Browse ${p.displayName} actions`}
                />
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
      className="flex flex-col gap-2"
      aria-label={`${provider.displayName} actions`}
    >
      <header className="flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to action picker"
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
            · actions
          </span>
        </div>
      </header>
      {loading ? (
        <p
          className="px-2 text-[11.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          Loading {provider.displayName} actions…
        </p>
      ) : error ? (
        <p
          role="alert"
          className="px-2 text-[11.5px]"
          style={{ color: "var(--builder-danger)" }}
        >
          {error}
        </p>
      ) : actions.length === 0 ? (
        <p
          className="px-2 text-[11.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          {provider.displayName} hasn&rsquo;t shipped action metadata yet.
          Configurable actions arrive in a later slice.
        </p>
      ) : filtered.length === 0 && searchQuery ? (
        <p
          className="px-2 text-[11.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          No matches in {provider.displayName} actions.
        </p>
      ) : (
        <ul
          aria-label={`${provider.displayName} actions list`}
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
