"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  VehicleSuggestionView,
  VehicleSuggestionsView,
} from "@/contracts/vehicleSuggestions";
import type { VehicleOptionView } from "@/contracts/vehicleLinks";
import { FleetioVehiclePicker } from "./FleetioVehiclePicker";

/**
 * The Suggested section (5.TRUCK-BRIDGE-1 CS-5).
 *
 * Every row states its EVIDENCE verbatim — "VIN 1FUJGLDR… matches",
 * "Unit 104 appears in \"Truck 104\"" — and nothing else. No percentage, no
 * score, no bar. A user should be able to judge a proposal by reading one
 * sentence, and an opaque number would let a weak match borrow the authority of
 * a strong one.
 *
 * Nothing here saves anything on its own. Every row needs a click, and an
 * AMBIGUOUS row cannot be confirmed as-proposed at all: it forces the user to
 * pick a specific Fleetio vehicle first, because the whole point of flagging
 * ambiguity is that the machine must not choose.
 */

const CONFIDENCE_COPY: Record<VehicleSuggestionView["confidence"], string> = {
  exact: "Exact match",
  strong: "Strong match",
  moderate: "Likely match",
  weak: "Possible match",
};

const TIER_COPY: Record<VehicleSuggestionView["tier"], string> = {
  vin: "VIN",
  plate: "License plate",
  number: "Unit number",
  name: "Name",
};

interface Props {
  accountId: string;
  canManage: boolean;
  view: VehicleSuggestionsView;
  suggestions: readonly VehicleSuggestionView[];
  pendingKey: string | null;
  bulkPending: boolean;
  rowError: { key: string; message: string } | null;
  onConfirm: (input: {
    suggestion: VehicleSuggestionView;
    targetVehicleId: string;
    targetLabel: string;
  }) => void;
  onDismiss: (suggestion: VehicleSuggestionView) => void;
  onBulkConfirm: () => void;
}

export function suggestionKey(s: {
  sourceVehicleId: string;
  targetVehicleId: string;
}): string {
  return `${s.sourceVehicleId}::${s.targetVehicleId}`;
}

export function SuggestedMatches({
  accountId,
  canManage,
  view,
  suggestions,
  pendingKey,
  bulkPending,
  rowError,
  onConfirm,
  onDismiss,
  onBulkConfirm,
}: Props) {
  const [pickedByKey, setPickedByKey] = useState<Record<string, VehicleOptionView>>({});

  if (view.status === "disconnected") {
    return (
      <p className="text-sm text-muted-foreground" data-testid="suggestions-disconnected">
        Connect both Motive and Fleetio to see suggested matches.
      </p>
    );
  }
  if (view.status === "unavailable") {
    return (
      <p className="text-sm text-destructive" data-testid="suggestions-unavailable">
        Your vehicle lists couldn&apos;t be loaded, so there are no suggestions to show
        right now. This does not mean there are no matches — try again in a moment.
      </p>
    );
  }
  if (suggestions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="suggestions-empty">
        No suggested matches. Pair any remaining vehicles by hand above.
      </p>
    );
  }

  const bulkCount = suggestions.filter((s) => s.bulkConfirmable).length;

  return (
    <div className="flex flex-col gap-3" data-testid="suggestions-list">
      {view.partialInventory && (
        <p className="text-xs text-muted-foreground" data-testid="suggestions-partial">
          Showing matches from the first page of each vehicle list — a match further
          down the list may not appear here yet.
        </p>
      )}

      {canManage && bulkCount > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="bulk-confirm">
          {view.bulkConfirmEnabled ? (
            <>
              <Button
                size="sm"
                disabled={bulkPending}
                data-testid="bulk-confirm-vin"
                onClick={onBulkConfirm}
              >
                {bulkPending
                  ? "Linking…"
                  : `Link ${bulkCount} unique exact-VIN ${bulkCount === 1 ? "match" : "matches"}`}
              </Button>
              <p
                className="max-w-prose text-xs leading-relaxed text-muted-foreground"
                data-testid="bulk-confirm-note"
              >
                {bulkCount === 1 ? "This is the only" : `These are the only ${bulkCount}`}{" "}
                {bulkCount === 1 ? "match whose" : "matches whose"} VIN is an exact,
                unique match on both sides — each VIN is re-checked as it&apos;s written.
                Every other suggestion still needs individual review below.
              </p>
            </>
          ) : (
            <p className="max-w-prose text-xs leading-relaxed text-muted-foreground" data-testid="bulk-confirm-unavailable">
              {bulkCount} exact VIN {bulkCount === 1 ? "match" : "matches"} found.
              Confirming them all at once isn&apos;t available — confirm the ones you
              want individually below.
            </p>
          )}
        </div>
      )}

      <ul className="flex flex-col">
        {suggestions.map((s) => {
          const key = suggestionKey(s);
          const pending = pendingKey === key;
          const picked = pickedByKey[key];
          const error = rowError?.key === key ? rowError.message : null;
          // An ambiguous row must not be confirmable as-proposed — the user has
          // to name the vehicle themselves.
          // The Fleetio side of the sentence AND the confirm target: the proposed
          // vehicle, or (ambiguous) whatever the user has chosen so far — undefined
          // until an ambiguous row is resolved, which also keeps Confirm disabled.
          const confirmTarget = s.ambiguous ? picked : { value: s.targetVehicleId, label: s.targetLabel };

          return (
            <li
              key={key}
              data-testid="suggestion-row"
              className="flex gap-4 border-t border-border/60 py-5 first:border-t-0"
            >
              {/* Proposed = a cyan gutter dot. */}
              <span
                aria-hidden
                className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-primary/70"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
                  <p className="text-base leading-relaxed text-foreground/90">
                    {/* `.font-medium` is the row's human identity — never the raw ids. */}
                    <span className="font-medium text-foreground">{s.sourceLabel}</span> in
                    Motive is the same truck as{" "}
                    {confirmTarget ? (
                      <span className="font-medium text-primary">{confirmTarget.label}</span>
                    ) : (
                      <span className="font-medium text-muted-foreground underline decoration-dashed decoration-muted-foreground/50 underline-offset-4">
                        a Fleetio vehicle you choose
                      </span>
                    )}{" "}
                    in Fleetio.
                  </p>
                  {/* Margin: match TYPE + word confidence. Never a percentage. */}
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">{TIER_COPY[s.tier]}</Badge>
                    <Badge variant={s.confidence === "exact" ? "success" : "secondary"}>
                      {CONFIDENCE_COPY[s.confidence]}
                    </Badge>
                  </span>
                </div>

                {/* The evidence, verbatim. Never a score. */}
                <p
                  className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground"
                  data-testid="suggestion-evidence"
                >
                  {s.evidence}
                </p>

                {s.ambiguous && (
                  <p
                    className="mt-1.5 max-w-prose text-sm leading-relaxed text-warning-foreground"
                    data-testid="suggestion-ambiguous"
                  >
                    More than one vehicle matches this way, so ChainReact won&apos;t pick for
                    you. Choose the right Fleetio vehicle to link it.
                  </p>
                )}

                {canManage && s.ambiguous && (
                  <div className="mt-3">
                    <FleetioVehiclePicker
                      accountId={accountId}
                      disabled={pending}
                      selectedId={picked?.value ?? null}
                      onSelect={(option) =>
                        setPickedByKey((current) => {
                          const next = { ...current };
                          if (option === null) delete next[key];
                          else next[key] = option;
                          return next;
                        })
                      }
                    />
                  </div>
                )}

                {error && (
                  <p
                    className="mt-2 max-w-prose border-l-2 border-destructive/50 pl-3 text-sm leading-relaxed text-destructive"
                    data-testid="suggestion-error"
                  >
                    {error}
                  </p>
                )}

                {canManage ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button
                      size="sm"
                      disabled={pending || confirmTarget === undefined}
                      data-testid="suggestion-confirm"
                      onClick={() => {
                        if (!confirmTarget) return;
                        onConfirm({
                          suggestion: s,
                          targetVehicleId: confirmTarget.value,
                          targetLabel: confirmTarget.label,
                        });
                      }}
                    >
                      {pending
                        ? "Linking…"
                        : s.ambiguous
                          ? "Pair the one I chose"
                          : "Yes, same truck"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      data-testid="suggestion-dismiss"
                      className="text-muted-foreground"
                      onClick={() => onDismiss(s)}
                    >
                      Not the same truck
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Ask an owner or admin to confirm or dismiss this match.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
