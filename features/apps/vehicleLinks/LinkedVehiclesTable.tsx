"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { VehicleLinkView } from "@/contracts/vehicleLinks";

/**
 * The Linked section (5.TRUCK-BRIDGE-1 CS-4).
 *
 * Each row leads with the HUMAN identity on both sides ("Unit 104 ↔ Truck 104")
 * and treats the raw provider ids as support detail: they live only inside a
 * collapsed Details disclosure, never as the row's primary identity and never
 * required for any task.
 *
 * Labels are LAST-SEEN snapshots, which the section says out loud — a vehicle
 * renamed in Motive or Fleetio shows its old name here until a live list
 * refreshes it, and a user should not read that as corruption.
 *
 * Remove asks for confirmation inline. It archives (soft) rather than deleting,
 * so a historical run that used the link stays explainable and the pair is
 * immediately free to be re-linked.
 */

/** Human-readable basis. `manual` is the only value CS-4 can produce. */
const MATCH_BASIS_COPY: Record<string, string> = {
  manual: "Linked by hand",
  suggested_vin: "Matched on VIN",
  suggested_plate: "Matched on plate",
  suggested_number: "Matched on unit number",
  suggested_name: "Matched on name",
};

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface Props {
  links: readonly VehicleLinkView[];
  canManage: boolean;
  pendingLinkId: string | null;
  onRemove: (linkId: string) => void;
}

export function LinkedVehiclesTable({ links, canManage, pendingLinkId, onRemove }: Props) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (links.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="linked-empty">
        No vehicles are linked yet. Pair a Motive vehicle with its Fleetio
        counterpart below, and every workflow can then find it automatically.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3" data-testid="linked-list">
      {links.map((link) => {
        const pending = pendingLinkId === link.id;
        return (
          <li
            key={link.id}
            data-testid="linked-row"
            className="flex flex-col gap-2 rounded border border-border p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">
                  {link.sourceLabel ?? "Unnamed Motive vehicle"}
                  <span aria-hidden className="mx-2 text-muted-foreground">
                    ↔
                  </span>
                  {link.targetLabel ?? "Unnamed Fleetio vehicle"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {MATCH_BASIS_COPY[link.matchBasis] ?? "Linked"}
                  {" · "}
                  {link.confirmedByLabel
                    ? `Confirmed by ${link.confirmedByLabel} on ${formatDate(link.confirmedAt)}`
                    : `Confirmed on ${formatDate(link.confirmedAt)}`}
                </span>
              </div>

              {canManage &&
                (confirmingId === link.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Remove this link?
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending}
                      data-testid="confirm-remove"
                      onClick={() => {
                        setConfirmingId(null);
                        onRemove(link.id);
                      }}
                    >
                      {pending ? "Removing…" : "Remove"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setConfirmingId(null)}
                    >
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    data-testid="remove-link"
                    onClick={() => setConfirmingId(link.id)}
                  >
                    Remove
                  </Button>
                ))}
            </div>

            {/* Raw ids are SUPPORT detail only — collapsed, never the identity. */}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Details</summary>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3">
                <dt>Motive vehicle id</dt>
                <dd className="font-mono">{link.sourceVehicleId}</dd>
                <dt>Fleetio vehicle id</dt>
                <dd className="font-mono">{link.targetVehicleId}</dd>
              </dl>
              <p className="mt-1">
                Names are the last ones ChainReact saw. If a vehicle was renamed,
                the new name appears the next time its list loads.
              </p>
            </details>
          </li>
        );
      })}
      <li className="text-xs text-muted-foreground">
        <Badge variant="outline">Snapshot</Badge> Vehicle names shown here were
        saved when each link was confirmed.
      </li>
    </ul>
  );
}
