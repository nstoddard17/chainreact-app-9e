"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  UnlinkedVehicleView,
  VehicleListStatus,
  VehicleOptionView,
} from "@/contracts/vehicleLinks";
import { FleetioVehiclePicker } from "./FleetioVehiclePicker";
import { vehicleListStatusCopy } from "./errorCopy";

/**
 * The Unlinked section (5.TRUCK-BRIDGE-1 CS-4).
 *
 * One row per Motive vehicle with no active link. Opening a row reveals the
 * `fleetio:vehicles` picker; choosing a vehicle and pressing Link confirms the
 * pairing. No raw id is ever typed and no JSON is ever edited — both sides come
 * from real account-aware lists.
 *
 * When the server refuses because this Motive vehicle already has a link, the
 * parent hands back `conflictFor` + copy and the row switches its button to an
 * EXPLICIT "Replace link" — the only path that sets `replaceExisting`. A mapping
 * is never silently overwritten.
 */

interface Props {
  accountId: string;
  canManage: boolean;
  unlinked: readonly UnlinkedVehicleView[];
  motiveStatus: VehicleListStatus;
  motiveHasMore: boolean;
  /** Source vehicle id currently being submitted, if any. */
  pendingSourceId: string | null;
  /** Source vehicle id whose last attempt hit a replaceable conflict. */
  conflictSourceId: string | null;
  /** Friendly copy for the row that failed, if any. */
  rowError: { sourceVehicleId: string; message: string } | null;
  onLink: (input: {
    source: UnlinkedVehicleView;
    target: VehicleOptionView;
    replaceExisting: boolean;
  }) => void;
}

export function UnlinkedVehiclesList({
  accountId,
  canManage,
  unlinked,
  motiveStatus,
  motiveHasMore,
  pendingSourceId,
  conflictSourceId,
  rowError,
  onLink,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<VehicleOptionView | null>(null);

  if (motiveStatus === "disconnected") {
    return (
      <p className="text-sm text-muted-foreground" data-testid="motive-disconnected">
        {vehicleListStatusCopy("disconnected", "Motive")}
      </p>
    );
  }
  if (motiveStatus === "error") {
    return (
      <p className="text-sm text-destructive" data-testid="motive-error">
        {vehicleListStatusCopy("error", "Motive")}
      </p>
    );
  }
  if (unlinked.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="unlinked-empty">
        Every Motive vehicle ChainReact can see is already linked.
      </p>
    );
  }

  return (
    <div className="flex flex-col" data-testid="unlinked-list">
      <ul className="flex flex-col">
        {unlinked.map((vehicle) => {
          const open = openId === vehicle.sourceVehicleId;
          const pending = pendingSourceId === vehicle.sourceVehicleId;
          const isConflict = conflictSourceId === vehicle.sourceVehicleId;
          const error =
            rowError?.sourceVehicleId === vehicle.sourceVehicleId ? rowError.message : null;
          return (
            <li
              key={vehicle.sourceVehicleId}
              data-testid="unlinked-row"
              className="flex gap-4 border-t border-border/60 py-5 first:border-t-0"
            >
              {/* Hollow gutter dot — an unpaired truck no automation can reach. */}
              <span
                aria-hidden
                className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full ring-[1.5px] ring-inset ring-muted-foreground/50"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
                  {/* Sentence with a "fill in the blank" for the Fleetio side. */}
                  <p className="text-base leading-relaxed text-foreground/90">
                    <span className="font-medium text-foreground">{vehicle.label}</span>{" "}
                    in Motive is the same truck as{" "}
                    {selected && open ? (
                      <span className="font-medium text-primary">{selected.label}</span>
                    ) : (
                      <span className="font-medium text-muted-foreground underline decoration-dashed decoration-muted-foreground/50 underline-offset-4">
                        a Fleetio vehicle you choose
                      </span>
                    )}{" "}
                    in Fleetio.
                  </p>
                  <p className="shrink-0 text-right font-mono text-[11px] leading-relaxed text-muted-foreground">
                    no automation can
                    <br />
                    reach this truck yet
                  </p>
                </div>

                {canManage ? (
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid="pair-toggle"
                      className="px-2 text-primary hover:text-primary"
                      onClick={() => {
                        setSelected(null);
                        setOpenId(open ? null : vehicle.sourceVehicleId);
                      }}
                    >
                      {open ? "Cancel" : "Link to Fleetio"}
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Ask an owner or admin to link this vehicle.
                  </p>
                )}

                {open && canManage && (
                  <div className="mt-3 flex flex-col gap-2">
                    <FleetioVehiclePicker
                      accountId={accountId}
                      disabled={pending}
                      selectedId={selected?.value ?? null}
                      onSelect={setSelected}
                    />
                    {error && (
                      <p
                        className="max-w-prose border-l-2 border-destructive/50 pl-3 text-sm leading-relaxed text-destructive"
                        data-testid="row-error"
                      >
                        {error}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        size="sm"
                        variant={isConflict ? "destructive" : "default"}
                        disabled={pending || selected === null}
                        data-testid={isConflict ? "replace-link" : "confirm-link"}
                        onClick={() => {
                          if (!selected) return;
                          onLink({
                            source: vehicle,
                            target: selected,
                            // The ONLY place replacement is authorized, and only
                            // after the server already refused once and the user
                            // pressed a button that says "Replace link".
                            replaceExisting: isConflict,
                          });
                        }}
                      >
                        {pending ? "Linking…" : isConflict ? "Replace link" : "Pair these two"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {motiveHasMore && (
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
          This is the first page of Motive&apos;s list. A truck further down it — or
          its match in Fleetio — may not have surfaced yet.
        </p>
      )}
    </div>
  );
}
