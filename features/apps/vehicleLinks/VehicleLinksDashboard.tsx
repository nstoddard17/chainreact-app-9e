"use client";

import { useState, type ReactNode } from "react";
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

  // Document tally — how much of the visible Motive fleet is paired, and how many
  // proposals are waiting. Derived from the SAME live client state the sections
  // render, so it moves the instant a row is confirmed, dismissed, or removed.
  const pairedCount = links.length;
  const totalTrucks = links.length + unlinked.length;
  const waitingCount = suggestions.length;

  return (
    <div className="flex flex-col gap-2" data-testid="vehicle-links-dashboard">
      <header className="flex flex-col gap-3 border-b border-border pb-8">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Motive <span aria-hidden>⇄</span> Fleetio
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Vehicle links</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Each truck exists twice — once in Motive, once in Fleetio. Say which pairs
          are the same truck, and every workflow finds the right Fleetio vehicle on
          its own. One workflow covers the fleet instead of one per truck.
        </p>
        <p className="text-sm text-muted-foreground" data-testid="vehicle-links-tally">
          <span className="font-semibold tabular-nums text-foreground">{pairedCount}</span> of{" "}
          <span className="font-semibold tabular-nums text-foreground">{totalTrucks}</span>{" "}
          Motive {totalTrucks === 1 ? "truck is" : "trucks are"} paired with Fleetio
          {waitingCount > 0 && (
            <>
              {" "}— and{" "}
              <span className="font-semibold tabular-nums text-foreground">{waitingCount}</span>{" "}
              {waitingCount === 1 ? "pairing is" : "pairings are"} waiting for your yes.
            </>
          )}
          {waitingCount === 0 && <>. Nothing is waiting on you.</>}
        </p>
        {!canManage && (
          <p className="text-xs text-muted-foreground" data-testid="view-only-note">
            You can view these links and use them in workflows. Only account owners
            and admins can change them.
          </p>
        )}
      </header>

      {banner && (
        <p
          className="mt-4 border-l-2 border-destructive/60 pl-3 text-sm text-destructive"
          data-testid="dashboard-error"
        >
          {banner}
        </p>
      )}

      <section className="flex flex-col gap-4 pt-10" data-testid="suggested-section">
        <SectionHeading
          title="Suggested pairings"
          hint="never saved without your yes"
          badge={<Badge variant="outline">Always needs your confirmation</Badge>}
        />
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

      <section className="flex flex-col gap-4 pt-10">
        <SectionHeading
          title="Not yet paired"
          hint="Motive trucks with no Fleetio counterpart"
        />
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

      <section className="flex flex-col gap-4 pt-10">
        <SectionHeading
          title="Paired"
          hint="workflows resolve these on their own"
        />
        <LinkedVehiclesTable
          links={links}
          canManage={canManage}
          pendingLinkId={pendingLinkId}
          health={health}
          onRemove={handleRemove}
          onRelink={handleRelink}
        />
      </section>

      <p className="mt-12 border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground">
        Labels are the names last seen in each system, not live truth. A truck
        renamed in Motive keeps its old name here until the list refreshes.
      </p>
    </div>
  );
}

/**
 * Group header in the document layout — a small mono label with an optional
 * plain-language hint and status badge. Keeps the section headings visually
 * subordinate to the sentence rows they introduce.
 */
function SectionHeading({
  title,
  hint,
  badge,
}: {
  title: string;
  hint: string;
  badge?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h2>
      <span className="text-xs text-muted-foreground/80">{hint}</span>
      {badge}
    </div>
  );
}
