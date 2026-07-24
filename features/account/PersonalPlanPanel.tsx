"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getPersonalBillingState,
  setPersonalCancelAtPeriodEnd,
  type PersonalPlanStateView,
} from "@/lib/api/personalBilling";
import { AccountApiError } from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";

/**
 * Personal-plan management panel (Slice 4.BILLING-PERSONAL-PRO-TEAM-CHOICE-3 / PPT-3).
 *
 * For an owner on a PERSONAL account (the parent BillingSection gates personal +
 * owner/admin; billing is live — no feature-flag gate), reads the safe PPT-1 state and lets the user
 * schedule (or undo) a downgrade to Free at period end. It mutates ONLY the Stripe
 * cancel-at-period-end flag via the PPT-1 route — never plan/status (webhook authority).
 *
 * Conservative copy: the downgrade happens at PERIOD END, no data is deleted, Pro access
 * continues until the end date, and (once confirmed) the personal cancellation stands even
 * if a later Team/Business checkout is abandoned. When the personal account is over Free
 * limits, the downgrade is blocked with the over-limit reasons and the action is disabled.
 *
 * No Stripe customer/subscription id is ever read here — the DTO carries none. A frozen
 * account is read-only: state shows, action buttons are hidden.
 */
interface Props {
  accountId: string;
  /** True when the active account is pending deletion (read-only). */
  frozen: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function blockerCopy(b: PersonalPlanStateView["downgrade"]["blockers"][number]): string {
  const noun = b.kind === "members" ? "members" : "folders";
  return `You have ${b.current} ${noun} (Free allows ${b.limit}).`;
}

export function PersonalPlanPanel({ accountId, frozen }: Props) {
  const [state, setState] = useState<PersonalPlanStateView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setState(await getPersonalBillingState(accountId));
    } catch (err) {
      setState(null);
      setLoadError(
        err instanceof AccountApiError ? err.message : "Couldn't load your plan. Try again.",
      );
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function applyCancel(next: boolean) {
    setBusy(true);
    setActionError(null);
    try {
      await setPersonalCancelAtPeriodEnd(accountId, next);
      setConfirming(false);
      await load();
    } catch (err) {
      setActionError(
        err instanceof AccountApiError ? err.message : "Couldn't update your plan. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div data-testid="personal-plan-panel" className="flex flex-col gap-2">
        <p role="alert" data-testid="personal-plan-error" className="text-xs text-destructive">
          {loadError}
        </p>
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="personal-plan-retry"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (state === null) {
    return (
      <div data-testid="personal-plan-panel">
        <p data-testid="personal-plan-loading" className="text-xs text-muted-foreground">
          Loading your plan…
        </p>
      </div>
    );
  }

  // Free personal account — informational, no destructive control.
  if (!state.isPaidPersonalPro) {
    return (
      <div data-testid="personal-plan-panel">
        {state.plan === "free" && (
          <p data-testid="personal-plan-free" className="text-xs text-muted-foreground">
            You&apos;re on the Free plan.
          </p>
        )}
      </div>
    );
  }

  const ends = formatDate(state.currentPeriodEnd);

  return (
    <div
      data-testid="personal-plan-panel"
      className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-3"
    >
      <div data-testid="personal-plan-card" className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-foreground">Personal Pro</span>
        <span data-testid="personal-plan-status" className="text-xs text-muted-foreground">
          {state.cancelAtPeriodEnd
            ? `Canceling — Pro access continues until ${ends}, then your account returns to Free. Your account and data are kept.`
            : `Active${state.currentPeriodEnd ? ` — renews ${ends}` : ""}.`}
        </span>
      </div>

      {frozen ? (
        <p data-testid="personal-plan-frozen" className="text-xs text-muted-foreground">
          This account is pending deletion — plan changes are unavailable.
        </p>
      ) : state.cancelAtPeriodEnd ? (
        // Scheduled to cancel → offer undo (non-destructive, no confirm needed).
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            data-testid="personal-undo"
            disabled={busy}
            onClick={() => void applyCancel(false)}
          >
            {busy ? "Updating…" : "Keep plan"}
          </Button>
        </div>
      ) : state.downgrade.allowed ? (
        // Eligible to downgrade → confirm step with the conservative copy.
        <div className="flex flex-col gap-2">
          {!confirming ? (
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="personal-downgrade-open"
                onClick={() => {
                  setConfirming(true);
                  setActionError(null);
                }}
              >
                Cancel subscription
              </Button>
            </div>
          ) : (
            <div
              data-testid="personal-downgrade-confirm-row"
              className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 dark:border-amber-400/30 dark:bg-amber-400/10"
            >
              <p className="text-xs text-muted-foreground">
                Your Pro subscription stops renewing and your personal account returns to Free
                at the end of the current period ({ends}).{" "}
                <span className="font-medium text-foreground">
                  Your account is not deleted and no data is deleted
                </span>{" "}
                — your workflows, folders, integrations, and keys stay. Pro access continues
                until then. Once confirmed, this cancellation stands even if you don&apos;t
                finish a Team/Business checkout.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  data-testid="personal-downgrade-confirm"
                  disabled={busy}
                  onClick={() => void applyCancel(true)}
                >
                  {busy ? "Canceling…" : "Cancel subscription"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid="personal-downgrade-cancel"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Keep plan
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Over Free limits → blocked, action disabled, reasons shown.
        <div data-testid="personal-downgrade-blocked" className="flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="personal-downgrade-open"
            disabled
          >
            Downgrade to Free at period end
          </Button>
          <ul data-testid="personal-plan-blockers" className="flex flex-col gap-1">
            {state.downgrade.blockers.map((b) => (
              <li key={b.kind} className="text-xs text-amber-600 dark:text-amber-400">
                {blockerCopy(b)}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Reduce these below the Free limits to downgrade. Nothing is deleted automatically.
          </p>
        </div>
      )}

      {actionError && (
        <p role="alert" data-testid="personal-plan-action-error" className="text-xs text-destructive">
          {actionError}
        </p>
      )}
    </div>
  );
}
