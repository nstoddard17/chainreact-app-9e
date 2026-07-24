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
    <ul className="flex flex-col" data-testid="linked-list">
      {links.map((link) => {
        const pending = pendingLinkId === link.id;
        const linkHealth = healthById.get(link.id);
        const warnings = (linkHealth?.statuses ?? []).filter(
          (s): s is Exclude<LinkHealthStatus, "ok"> => s !== "ok",
        );
        const stale = linkHealth?.needsAttention ?? false;
        return (
          <li
            key={link.id}
            data-testid="linked-row"
            data-health={stale ? "attention" : "ok"}
            className="flex gap-4 border-t border-border/60 py-5 first:border-t-0"
          >
            <StatusDot kind={stale ? "attention" : "paired"} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
                {/* Document sentence: the two identities are the row. */}
                <p className="text-base leading-relaxed text-foreground/90">
                  <span className="font-medium text-foreground">
                    {link.sourceLabel ?? "Unnamed Motive vehicle"}
                  </span>{" "}
                  is{" "}
                  <span className="font-medium text-primary">
                    {link.targetLabel ?? "Unnamed Fleetio vehicle"}
                  </span>
                  .
                </p>
                {/* Right margin: provenance, quiet + mono. */}
                <p className="shrink-0 text-right font-mono text-[11px] leading-relaxed text-muted-foreground">
                  <span className="block">{MATCH_BASIS_COPY[link.matchBasis] ?? "Linked"}</span>
                  <span className="block">
                    {link.confirmedByLabel
                      ? `Confirmed by ${link.confirmedByLabel} on ${formatDate(link.confirmedAt)}`
                      : `Confirmed on ${formatDate(link.confirmedAt)}`}
                  </span>
                </p>
              </div>

              {/*
                Stale-link warnings (CS-5). Rendered as guidance next to the
                mapping — the mapping itself is NEVER auto-archived or replaced,
                and the stored names stay visible so the history still reads.
              */}
              {warnings.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1" data-testid="link-health">
                  {warnings.map((status) => (
                    <li
                      key={status}
                      data-testid={`link-health-${status}`}
                      className={`max-w-prose text-sm leading-relaxed ${
                        status.endsWith("_unknown")
                          ? "text-muted-foreground"
                          : "text-warning-foreground"
                      }`}
                    >
                      {HEALTH_COPY[status]}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {canManage && stale && onRelink && (
                  <Button
                    size="sm"
                    disabled={pending}
                    data-testid="relink"
                    onClick={() => onRelink(link)}
                  >
                    Re-link this truck
                  </Button>
                )}
                {canManage &&
                  (confirmingId === link.id ? (
                    <span className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
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
                      variant="ghost"
                      disabled={pending}
                      data-testid="remove-link"
                      onClick={() => setConfirmingId(link.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      Unpair — send it back to the list
                    </Button>
                  ))}
              </div>

              {/* Raw ids are SUPPORT detail only — collapsed, never the identity. */}
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Details</summary>
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
            </div>
          </li>
        );
      })}
      <li className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">Snapshot</Badge> Vehicle names shown here were
        saved when each link was confirmed.
      </li>
    </ul>
  );
}

/**
 * Small status dot in the document's left gutter. Green = paired, amber (pulsing)
 * = needs attention. Colour is never the sole signal — every row also carries a
 * word-based state in its margin/health copy.
 */
function StatusDot({ kind }: { kind: "paired" | "attention" }) {
  return (
    <span
      aria-hidden
      className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${
        kind === "attention"
          ? "bg-warning motion-safe:animate-pulse"
          : "bg-success"
      }`}
    />
  );
}
