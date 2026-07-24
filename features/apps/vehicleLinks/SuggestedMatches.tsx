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
        <div className="flex flex-wrap items-center gap-2">
          {view.bulkConfirmEnabled ? (
            <Button
              size="sm"
              disabled={bulkPending}
              data-testid="bulk-confirm-vin"
              onClick={onBulkConfirm}
            >
              {bulkPending
                ? "Confirming…"
                : `Confirm all exact VIN matches (${bulkCount})`}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="bulk-confirm-unavailable">
              {bulkCount} exact VIN {bulkCount === 1 ? "match" : "matches"} found.
              Confirming them all at once isn&apos;t available yet — confirm the ones you
              want individually below.
            </p>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {suggestions.map((s) => {
          const key = suggestionKey(s);
          const pending = pendingKey === key;
          const picked = pickedByKey[key];
          const error = rowError?.key === key ? rowError.message : null;
          // An ambiguous row must not be confirmable as-proposed — the user has
          // to name the vehicle themselves.
          const confirmTarget = s.ambiguous ? picked : { value: s.targetVehicleId, label: s.targetLabel };

          return (
            <li
              key={key}
              data-testid="suggestion-row"
              className="flex flex-col gap-2 rounded border border-border p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">
                    {s.sourceLabel}
                    <span aria-hidden className="mx-2 text-muted-foreground">
                      ↔
                    </span>
                    {s.targetLabel}
                  </span>
                  {/* The evidence, verbatim. Never a score. */}
                  <span className="text-xs text-muted-foreground" data-testid="suggestion-evidence">
                    {s.evidence}
                  </span>
                </div>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{TIER_COPY[s.tier]}</Badge>
                  <Badge variant={s.confidence === "exact" ? "success" : "secondary"}>
                    {CONFIDENCE_COPY[s.confidence]}
                  </Badge>
                </span>
              </div>

              {s.ambiguous && (
                <p className="text-xs text-warning-foreground" data-testid="suggestion-ambiguous">
                  More than one vehicle matches this way, so ChainReact won&apos;t pick for
                  you. Choose the right Fleetio vehicle to link it.
                </p>
              )}

              {canManage && s.ambiguous && (
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
              )}

              {error && (
                <p className="text-xs text-destructive" data-testid="suggestion-error">
                  {error}
                </p>
              )}

              {canManage ? (
                <div className="flex items-center gap-2">
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
                    {pending ? "Linking…" : s.ambiguous ? "Link chosen vehicle" : "Confirm"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    data-testid="suggestion-dismiss"
                    onClick={() => onDismiss(s)}
                  >
                    Dismiss
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Ask an owner or admin to confirm or dismiss this match.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
