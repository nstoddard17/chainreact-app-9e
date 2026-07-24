"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  fetchVehicleOptions,
  type VehicleLinkApiError,
} from "@/lib/api/vehicleLinks";
import type { VehicleOptionView } from "@/contracts/vehicleLinks";
import { vehicleListStatusCopy } from "./errorCopy";

/**
 * The Fleetio side of a manual pairing (5.TRUCK-BRIDGE-1 CS-4).
 *
 * A searchable list backed by the EXISTING `fleetio:vehicles` resolver (through
 * the account-scoped vehicle-options route). Selecting a row hands the caller
 * BOTH the id and the label, so the confirmed link stores a display snapshot
 * without the user ever seeing — let alone typing — a raw Fleetio id.
 *
 * Four states, all real: loading, empty, disconnected, error. `disconnected` is
 * kept distinct from `error` because the fix differs (connect the app vs. try
 * again), and the raw provider reason is never shown.
 */

interface Props {
  accountId: string;
  disabled?: boolean;
  selectedId: string | null;
  onSelect: (option: VehicleOptionView | null) => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; items: readonly VehicleOptionView[]; hasMore: boolean }
  | { kind: "disconnected" }
  | { kind: "error" };

export function FleetioVehiclePicker({
  accountId,
  disabled = false,
  selectedId,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    // Debounced so typing doesn't fan out one provider call per keystroke.
    const timer = setTimeout(() => {
      fetchVehicleOptions(accountId, "fleetio", query)
        .then((result) => {
          if (cancelled) return;
          if (result.status === "disconnected") return setState({ kind: "disconnected" });
          if (result.status === "error") return setState({ kind: "error" });
          setState({ kind: "ok", items: result.items, hasMore: result.hasMore });
        })
        .catch((_err: VehicleLinkApiError) => {
          if (!cancelled) setState({ kind: "error" });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accountId, query]);

  return (
    <div
      className="flex max-w-lg flex-col gap-2 rounded-lg border border-border bg-card p-2"
      data-testid="fleetio-vehicle-picker"
    >
      <Input
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your Fleetio vehicles"
        aria-label="Search Fleetio vehicles"
      />

      {state.kind === "loading" && (
        <p className="text-xs text-muted-foreground" data-testid="fleetio-picker-loading">
          Loading Fleetio vehicles…
        </p>
      )}

      {state.kind === "disconnected" && (
        <p className="text-xs text-muted-foreground" data-testid="fleetio-picker-disconnected">
          {vehicleListStatusCopy("disconnected", "Fleetio")}
        </p>
      )}

      {state.kind === "error" && (
        <p className="text-xs text-destructive" data-testid="fleetio-picker-error">
          {vehicleListStatusCopy("error", "Fleetio")}
        </p>
      )}

      {state.kind === "ok" && state.items.length === 0 && (
        <p className="text-xs text-muted-foreground" data-testid="fleetio-picker-empty">
          No Fleetio vehicles match that search.
        </p>
      )}

      {state.kind === "ok" && state.items.length > 0 && (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto" role="listbox">
          {state.items.map((item) => {
            const selected = item.value === selectedId;
            return (
              <li key={item.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={disabled}
                  onClick={() => onSelect(selected ? null : item)}
                  className={`flex w-full items-baseline justify-between gap-3 rounded px-2.5 py-1.5 text-left text-sm ${
                    selected
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-foreground/90 hover:bg-accent/50"
                  }`}
                >
                  <span className="min-w-0 truncate">{item.label}</span>
                  {item.description ? (
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {state.kind === "ok" && state.hasMore && (
        <p className="text-xs text-muted-foreground">
          Showing the first page — search to narrow it down.
        </p>
      )}
    </div>
  );
}
