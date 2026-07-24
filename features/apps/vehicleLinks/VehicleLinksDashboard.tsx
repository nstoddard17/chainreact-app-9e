"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  archiveVehicleLink,
  bulkConfirmVinMatches,
  confirmSuggestion,
  createVehicleLink,
  dismissSuggestion,
  VehicleLinkApiError,
} from "@/lib/api/vehicleLinks";
import type {
  UnlinkedVehicleView,
  VehicleLinkView,
  VehicleListStatus,
  VehicleOptionView,
} from "@/contracts/vehicleLinks";
import type {
  VehicleLinkHealthView,
  VehicleSuggestionView,
  VehicleSuggestionsView,
} from "@/contracts/vehicleSuggestions";
import { LinkedVehiclesTable } from "./LinkedVehiclesTable";
import { UnlinkedVehiclesList } from "./UnlinkedVehiclesList";
import { SuggestedMatches, suggestionKey } from "./SuggestedMatches";
import { vehicleLinkErrorCopy } from "./errorCopy";

/**
 * `/apps/vehicle-links` client dashboard (5.TRUCK-BRIDGE-1 CS-4).
 *
 * Owns the mutation lifecycle for the two real sections — Linked and Unlinked —
 * and updates local state from the server's response rather than guessing, so a
 * refused confirm never leaves a phantom row on screen.
 *
 * CS-5 replaced the "Coming next" placeholder with the real Suggested section,
 * backed by CS-2's pure matcher. Every proposal shows its evidence verbatim and
 * still needs a click; nothing is written because the page loaded.
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
  /** CS-5 — suggestions + their status. Absent ⇒ the section renders nothing. */
  suggestions?: VehicleSuggestionsView;
  /** CS-5 — stale-link annotations, keyed by link id. */
  health?: readonly VehicleLinkHealthView[];
}

export function VehicleLinksDashboard({
  accountId,
  canManage,
  links: initialLinks,
  motiveStatus,
  motiveHasMore,
  unlinked: initialUnlinked,
  suggestions: initialSuggestionsView,
  health,
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
  // CS-5 — suggestions live in local state so a confirm/dismiss removes the row
  // without a re-fetch (each recomputation costs two provider list calls).
  const [suggestions, setSuggestions] = useState<readonly VehicleSuggestionView[]>(
    initialSuggestionsView?.suggestions ?? [],
  );
  const [pendingSuggestionKey, setPendingSuggestionKey] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [suggestionError, setSuggestionError] = useState<{
    key: string;
    message: string;
  } | null>(null);

  /** Drop a suggestion, plus any sibling that just became impossible. */
  function retireSuggestions(sourceVehicleId: string, targetVehicleId: string) {
    setSuggestions((current) =>
      current.filter(
        (s) => s.sourceVehicleId !== sourceVehicleId && s.targetVehicleId !== targetVehicleId,
      ),
    );
  }

  function absorbConfirmedLink(link: VehicleLinkView) {
    setLinks((current) => [
      link,
      ...current.filter((l) => l.sourceVehicleId !== link.sourceVehicleId),
    ]);
    setUnlinked((current) =>
      current.filter((v) => v.sourceVehicleId !== link.sourceVehicleId),
    );
    retireSuggestions(link.sourceVehicleId, link.targetVehicleId);
  }

  async function handleConfirmSuggestion(input: {
    suggestion: VehicleSuggestionView;
    targetVehicleId: string;
    targetLabel: string;
  }) {
    const key = suggestionKey(input.suggestion);
    if (pendingSuggestionKey !== null) return;
    setPendingSuggestionKey(key);
    setSuggestionError(null);
    setBanner(null);
    try {
      const link = await confirmSuggestion(accountId, {
        sourceVehicleId: input.suggestion.sourceVehicleId,
        targetVehicleId: input.targetVehicleId,
      });
      absorbConfirmedLink(link);
    } catch (err) {
      const code = err instanceof VehicleLinkApiError ? err.code : "request_failed";
      setSuggestionError({ key, message: vehicleLinkErrorCopy(code) });
    } finally {
      setPendingSuggestionKey(null);
    }
  }

  async function handleDismissSuggestion(suggestion: VehicleSuggestionView) {
    const key = suggestionKey(suggestion);
    if (pendingSuggestionKey !== null) return;
    setPendingSuggestionKey(key);
    setSuggestionError(null);
    try {
      await dismissSuggestion(accountId, {
        sourceVehicleId: suggestion.sourceVehicleId,
        targetVehicleId: suggestion.targetVehicleId,
        tier: suggestion.tier,
        evidenceFingerprint: suggestion.evidenceFingerprint,
      });
      // Only THIS pair disappears — dismissing one proposal never suppresses a
      // different vehicle's suggestion.
      setSuggestions((current) => current.filter((s) => suggestionKey(s) !== key));
    } catch (err) {
      const code = err instanceof VehicleLinkApiError ? err.code : "request_failed";
      setSuggestionError({ key, message: vehicleLinkErrorCopy(code) });
    } finally {
      setPendingSuggestionKey(null);
    }
  }

  async function handleBulkConfirm() {
    if (bulkPending) return;
    setBulkPending(true);
    setBanner(null);
    try {
      const result = await bulkConfirmVinMatches(accountId);
      for (const link of result.confirmed) absorbConfirmedLink(link);
      if (result.skipped > 0) {
        setBanner(
          `${result.confirmed.length} linked. ${result.skipped} were skipped because those vehicles were already linked.`,
        );
      }
    } catch (err) {
      const code = err instanceof VehicleLinkApiError ? err.code : "request_failed";
      setBanner(vehicleLinkErrorCopy(code));
    } finally {
      setBulkPending(false);
    }
  }

  /**
   * Re-link a stale mapping: archive the current link, which returns the truck
   * to Unlinked so it can be paired afresh. Deliberately the SAME archive path
   * as Remove — nothing is replaced behind the user's back.
   */
  function handleRelink(link: VehicleLinkView) {
    void handleRemove(link.id);
  }

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
          health={health}
          onRemove={handleRemove}
          onRelink={handleRelink}
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

      <section className="flex flex-col gap-3" data-testid="suggested-section">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          Suggested
          <Badge variant="outline">Always needs your confirmation</Badge>
        </h2>
        {initialSuggestionsView ? (
          <SuggestedMatches
            accountId={accountId}
            canManage={canManage}
            view={initialSuggestionsView}
            suggestions={suggestions}
            pendingKey={pendingSuggestionKey}
            bulkPending={bulkPending}
            rowError={suggestionError}
            onConfirm={handleConfirmSuggestion}
            onDismiss={handleDismissSuggestion}
            onBulkConfirm={handleBulkConfirm}
          />
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="suggestions-disconnected">
            Connect both Motive and Fleetio to see suggested matches.
          </p>
        )}
      </section>
    </div>
  );
}
