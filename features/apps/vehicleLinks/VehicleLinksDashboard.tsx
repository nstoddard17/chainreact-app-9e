"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  archiveVehicleLink,
  createVehicleLink,
  VehicleLinkApiError,
} from "@/lib/api/vehicleLinks";
import type {
  UnlinkedVehicleView,
  VehicleLinkView,
  VehicleListStatus,
  VehicleOptionView,
} from "@/contracts/vehicleLinks";
import { LinkedVehiclesTable } from "./LinkedVehiclesTable";
import { UnlinkedVehiclesList } from "./UnlinkedVehiclesList";
import { vehicleLinkErrorCopy } from "./errorCopy";

/**
 * `/apps/vehicle-links` client dashboard (5.TRUCK-BRIDGE-1 CS-4).
 *
 * Owns the mutation lifecycle for the two real sections — Linked and Unlinked —
 * and updates local state from the server's response rather than guessing, so a
 * refused confirm never leaves a phantom row on screen.
 *
 * The Suggested section is rendered as an explicitly DISABLED "Coming next"
 * note. It shows no candidate rows, no counts, and no evidence, because CS-4
 * ships no matching: a placeholder that looked like real suggestions would be
 * fake UI. CS-2's matching core exists but nothing calls it yet — CS-5 wires it.
 *
 * Members see the same data with no mutation affordances; the server re-checks
 * owner/admin on every write regardless, so the hidden buttons are a courtesy,
 * not the control.
 */

interface Props {
  accountId: string;
  canManage: boolean;
  links: readonly VehicleLinkView[];
  motiveStatus: VehicleListStatus;
  motiveHasMore: boolean;
  unlinked: readonly UnlinkedVehicleView[];
}

export function VehicleLinksDashboard({
  accountId,
  canManage,
  links: initialLinks,
  motiveStatus,
  motiveHasMore,
  unlinked: initialUnlinked,
}: Props) {
  const [links, setLinks] = useState<readonly VehicleLinkView[]>(initialLinks);
  const [unlinked, setUnlinked] = useState<readonly UnlinkedVehicleView[]>(initialUnlinked);
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null);
  const [pendingLinkId, setPendingLinkId] = useState<string | null>(null);
  const [conflictSourceId, setConflictSourceId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    sourceVehicleId: string;
    message: string;
  } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  async function handleLink(input: {
    source: UnlinkedVehicleView;
    target: VehicleOptionView;
    replaceExisting: boolean;
  }) {
    if (pendingSourceId !== null) return;
    setPendingSourceId(input.source.sourceVehicleId);
    setRowError(null);
    setBanner(null);
    try {
      const link = await createVehicleLink(accountId, {
        sourceVehicleId: input.source.sourceVehicleId,
        sourceLabel: input.source.label,
        targetVehicleId: input.target.value,
        targetLabel: input.target.label,
        ...(input.replaceExisting ? { replaceExisting: true } : {}),
      });
      // A replacement archives the previous link for this Motive vehicle, so drop
      // any existing row for that source before adding the new one.
      setLinks((current) => [
        link,
        ...current.filter((l) => l.sourceVehicleId !== link.sourceVehicleId),
      ]);
      setUnlinked((current) =>
        current.filter((v) => v.sourceVehicleId !== link.sourceVehicleId),
      );
      setConflictSourceId(null);
    } catch (err) {
      const code = err instanceof VehicleLinkApiError ? err.code : "request_failed";
      const conflict = err instanceof VehicleLinkApiError ? err.conflict : null;
      setRowError({
        sourceVehicleId: input.source.sourceVehicleId,
        message: vehicleLinkErrorCopy(code, conflict),
      });
      // Only a SOURCE conflict is replaceable. A target conflict must be fixed by
      // removing the other link, so it never unlocks a Replace button.
      setConflictSourceId(
        code === "SOURCE_ALREADY_LINKED" ? input.source.sourceVehicleId : null,
      );
    } finally {
      setPendingSourceId(null);
    }
  }

  async function handleRemove(linkId: string) {
    if (pendingLinkId !== null) return;
    const removed = links.find((l) => l.id === linkId);
    setPendingLinkId(linkId);
    setBanner(null);
    try {
      await archiveVehicleLink(accountId, linkId);
      setLinks((current) => current.filter((l) => l.id !== linkId));
      // The vehicle becomes re-linkable immediately (both unique indexes are
      // partial on active rows), so it returns to the Unlinked list.
      if (removed) {
        setUnlinked((current) =>
          current.some((v) => v.sourceVehicleId === removed.sourceVehicleId)
            ? current
            : [
                ...current,
                {
                  sourceVehicleId: removed.sourceVehicleId,
                  label: removed.sourceLabel ?? removed.sourceVehicleId,
                },
              ],
        );
      }
    } catch (err) {
      const code = err instanceof VehicleLinkApiError ? err.code : "request_failed";
      setBanner(vehicleLinkErrorCopy(code));
    } finally {
      setPendingLinkId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8" data-testid="vehicle-links-dashboard">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Vehicle links</h1>
        <p className="text-sm text-muted-foreground">
          Pair each Motive vehicle with the same truck in Fleetio once. Workflows
          then find the right Fleetio vehicle on their own, so one workflow covers
          the whole fleet instead of one per truck.
        </p>
        {!canManage && (
          <p className="text-xs text-muted-foreground" data-testid="view-only-note">
            You can view these links and use them in workflows. Only account owners
            and admins can change them.
          </p>
        )}
      </header>

      {banner && (
        <p className="text-sm text-destructive" data-testid="dashboard-error">
          {banner}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Linked</h2>
        <LinkedVehiclesTable
          links={links}
          canManage={canManage}
          pendingLinkId={pendingLinkId}
          onRemove={handleRemove}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Unlinked Motive vehicles</h2>
        <UnlinkedVehiclesList
          accountId={accountId}
          canManage={canManage}
          unlinked={unlinked}
          motiveStatus={motiveStatus}
          motiveHasMore={motiveHasMore}
          pendingSourceId={pendingSourceId}
          conflictSourceId={conflictSourceId}
          rowError={rowError}
          onLink={handleLink}
        />
      </section>

      {/* No fake suggestions: CS-4 ships no matching, so this shows nothing. */}
      <section className="flex flex-col gap-2" data-testid="suggested-placeholder">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          Suggested
          <Badge variant="outline">Coming next</Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          ChainReact will soon propose matches by VIN, plate, and unit number — each
          with the evidence it used, and each still needing your confirmation. Until
          then, pair vehicles by hand above.
        </p>
      </section>
    </div>
  );
}
