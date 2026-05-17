"use client";

import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { ProviderOption } from "./AddNodeMenu";

/**
 * Trigger picker — Slice 3.3 surface, extracted to a sibling in
 * Slice 3.4 for parity with `ActionPicker`.
 *
 * Provider triggers still use the legacy bare-add path
 * (`addTrigger({ provider })`) — this is intentional. Per the Slice 3.4
 * task brief, provider-trigger wrappers are out of scope and land in a
 * later slice. When they do, the picker grows the same drill-in shape
 * as `ActionPicker.ProviderActionsView`; for now it stays a flat list.
 */

export interface TriggerPickerProps {
  nativeTriggers: readonly TriggerMeta[];
  nativeLoading: boolean;
  nativeError: string | null;
  triggerProviders: readonly ProviderOption[];
  onPickNative: (meta: TriggerMeta) => void;
  onPickProvider: (provider: ProviderOption) => void;
}

export function TriggerPicker({
  nativeTriggers,
  nativeLoading,
  nativeError,
  triggerProviders,
  onPickNative,
  onPickProvider,
}: TriggerPickerProps) {
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
        ) : (
          <ul aria-label="Native triggers list" className="flex flex-col gap-1">
            {nativeTriggers.map((meta) => (
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
                  onClick={() => onPickProvider(p)}
                  className="rounded bg-muted px-3 py-1 text-sm"
                >
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
