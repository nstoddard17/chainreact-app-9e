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
    <div className="flex flex-col gap-3" data-testid="unlinked-list">
      <ul className="flex flex-col gap-2">
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
              className="flex flex-col gap-2 rounded border border-border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{vehicle.label}</span>
                {canManage ? (
                  <Button
                    size="sm"
                    variant={open ? "ghost" : "outline"}
                    data-testid="pair-toggle"
                    onClick={() => {
                      setSelected(null);
                      setOpenId(open ? null : vehicle.sourceVehicleId);
                    }}
                  >
                    {open ? "Cancel" : "Link to Fleetio"}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Ask an owner or admin to link this vehicle.
                  </span>
                )}
              </div>

              {open && canManage && (
                <div className="flex flex-col gap-2">
                  <FleetioVehiclePicker
                    accountId={accountId}
                    disabled={pending}
                    selectedId={selected?.value ?? null}
                    onSelect={setSelected}
                  />
                  {error && (
                    <p className="text-xs text-destructive" data-testid="row-error">
                      {error}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
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
                      {pending ? "Linking…" : isConflict ? "Replace link" : "Link"}
                    </Button>
                    {selected && (
                      <span className="text-xs text-muted-foreground">
                        {vehicle.label} ↔ {selected.label}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {motiveHasMore && (
        <p className="text-xs text-muted-foreground">
          Showing the first page of Motive vehicles.
        </p>
      )}
    </div>
  );
}
