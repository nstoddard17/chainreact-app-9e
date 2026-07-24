"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { VehicleLinkView } from "@/contracts/vehicleLinks";
import type { VehicleLinkHealthView } from "@/contracts/vehicleSuggestions";
import type { LinkHealthStatus } from "@/core/resourceLinks/linkHealth";

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

/**
 * Stale-link copy (CS-5). Each sentence names what ChainReact can and cannot
 * see, and what to do — never "deleted", which ChainReact cannot actually know.
 *
 * The `*_unknown` variants are the load-bearing ones: during a provider outage
 * EVERY link on that side reports unknown, and saying "no longer in Motive"
 * there would be false and would invite users to remove healthy mappings.
 */
const HEALTH_COPY: Record<Exclude<LinkHealthStatus, "ok">, string> = {
  source_missing:
    "This Motive vehicle is no longer in your Motive vehicle list. The link still works if the id is still valid — remove it or re-link if the truck was replaced.",
  target_missing:
    "This Fleetio vehicle is no longer in your Fleetio vehicle list. Meter entries written to it will fail — re-link this truck to its current Fleetio vehicle.",
  target_archived:
    "This Fleetio vehicle is archived in Fleetio. Writes to it will fail — re-link this truck to an active Fleetio vehicle.",
  source_unknown:
    "Your Motive vehicle list couldn't be loaded, so ChainReact can't check this side right now. The link is unchanged.",
  target_unknown:
    "Your Fleetio vehicle list couldn't be loaded, so ChainReact can't check this side right now. The link is unchanged.",
};

interface Props {
  links: readonly VehicleLinkView[];
  canManage: boolean;
  pendingLinkId: string | null;
  /** Health per link id (CS-5). Absent entries render no warning. */
  health?: readonly VehicleLinkHealthView[];
  onRemove: (linkId: string) => void;
  /** Re-link: hand this truck back to the Unlinked list to pair afresh. */
  onRelink?: (link: VehicleLinkView) => void;
}

export function LinkedVehiclesTable({
  links,
  canManage,
  pendingLinkId,
  health,
  onRemove,
  onRelink,
}: Props) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const healthById = new Map((health ?? []).map((h) => [h.linkId, h]));

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
        const linkHealth = healthById.get(link.id);
        const warnings = (linkHealth?.statuses ?? []).filter(
          (s): s is Exclude<LinkHealthStatus, "ok"> => s !== "ok",
        );
        return (
          <li
            key={link.id}
            data-testid="linked-row"
            data-health={linkHealth?.needsAttention ? "attention" : "ok"}
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

            {/*
              Stale-link warnings (CS-5). Rendered as guidance next to the
              mapping — the mapping itself is NEVER auto-archived or replaced,
              and the stored names stay visible so the history still reads.
            */}
            {warnings.length > 0 && (
              <ul className="flex flex-col gap-1" data-testid="link-health">
                {warnings.map((status) => (
                  <li
                    key={status}
                    data-testid={`link-health-${status}`}
                    className={`text-xs ${
                      status.endsWith("_unknown") ? "text-muted-foreground" : "text-warning-foreground"
                    }`}
                  >
                    {HEALTH_COPY[status]}
                  </li>
                ))}
                {canManage && onRelink && linkHealth?.needsAttention && (
                  <li>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      data-testid="relink"
                      onClick={() => onRelink(link)}
                    >
                      Re-link this vehicle
                    </Button>
                  </li>
                )}
              </ul>
            )}

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
