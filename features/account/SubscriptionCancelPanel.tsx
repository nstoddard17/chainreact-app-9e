"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getAccountSubscription,
  setAccountSubscriptionAction,
  type AccountSubscriptionView,
} from "@/lib/api/subscription";
import { AccountApiError } from "@/lib/api/accounts";
import { planTierLabel } from "@/core/billing/planPolicy";
import { Button } from "@/components/ui/button";

/**
 * Account-scoped subscription cancel / resume panel (Slice 4.ACCOUNT-BILLING-LIFECYCLE-1).
 *
 * Lives in **Plan & billing**, never in the Danger Zone — cancelling a subscription and
 * deleting an account are two separate actions with two separate surfaces, and this one
 * says so explicitly ("your account and data stay"). Used for Team / Business accounts,
 * which previously had no in-app cancel at all (portal only); personal accounts keep the
 * `PersonalPlanPanel` Pro→Free flow, which now shares the same backend operation.
 *
 * Honesty rules this component follows:
 *   - It NEVER claims the plan is already Free. Cancellation is scheduled at period end and
 *     the local downgrade only happens when Stripe confirms the subscription ended, so the
 *     panel shows the effective date and keeps the plan label until then.
 *   - Pending / success / failure are all distinct visible states; an error stays on screen
 *     with an actionable message and never silently reverts the UI.
 *   - A non-owner (admin) sees the read-only state with no controls — `canManage` is decided
 *     by the SERVER, not inferred here.
 *   - No Stripe id is ever received or rendered — the DTO carries none.
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

export function SubscriptionCancelPanel({ accountId, frozen }: Props) {
  const [state, setState] = useState<AccountSubscriptionView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setState(await getAccountSubscription(accountId));
    } catch (err) {
      setState(null);
      setLoadError(
        err instanceof AccountApiError
          ? err.message
          : "Couldn't load your subscription. Try again.",
      );
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function apply(action: "cancel" | "resume") {
    setBusy(true);
    setActionError(null);
    try {
      await setAccountSubscriptionAction(accountId, action);
      setConfirming(false);
      // Re-read rather than trusting an optimistic local flip — the server (and behind it
      // Stripe) is the authority for what the user is now on.
      await load();
    } catch (err) {
      setActionError(
        err instanceof AccountApiError
          ? err.message
          : "Couldn't update your subscription. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div data-testid="subscription-cancel-panel" className="flex flex-col gap-2">
        <p role="alert" data-testid="subscription-load-error" className="text-xs text-destructive">
          {loadError}
        </p>
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="subscription-retry"
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
      <div data-testid="subscription-cancel-panel">
        <p data-testid="subscription-loading" className="text-xs text-muted-foreground">
          Loading your subscription…
        </p>
      </div>
    );
  }

  // No paid subscription to cancel (Free, internal billing, or already ended) — say so
  // plainly instead of rendering a dead control.
  if (!state.isCancelable) {
    return (
      <div data-testid="subscription-cancel-panel">
        <p data-testid="subscription-none" className="text-xs text-muted-foreground">
          {state.internalBilling
            ? "This account uses internal billing — there is no subscription to cancel."
            : "There's no active paid subscription on this account."}
        </p>
      </div>
    );
  }

  const ends = formatDate(state.currentPeriodEnd);
  const planLabel = planTierLabel(state.plan);

  return (
    <div
      data-testid="subscription-cancel-panel"
      className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-3"
    >
      <div className="flex flex-col gap-1">
        <span data-testid="subscription-plan" className="text-sm font-semibold text-foreground">
          {planLabel}
        </span>
        <span data-testid="subscription-status" className="text-xs text-muted-foreground">
          {state.cancelAtPeriodEnd
            ? `Canceling — ${planLabel} access continues until ${ends}, and the plan won't renew.`
            : `Active${state.currentPeriodEnd ? ` — renews ${ends}` : ""}.`}
        </span>
      </div>

      {frozen ? (
        <p data-testid="subscription-frozen" className="text-xs text-muted-foreground">
          This account is pending deletion — plan changes are unavailable.
        </p>
      ) : !state.canManage ? (
        // Admins can SEE billing but not change it (owner-only). Read-only, not a
        // disabled-button tease.
        <p data-testid="subscription-owner-only" className="text-xs text-muted-foreground">
          Only the account owner can cancel this subscription.
        </p>
      ) : state.cancelAtPeriodEnd ? (
        // Scheduled to cancel → offer "Keep plan" (non-destructive, no confirm step).
        <div>
          <Button
            type="button"
            size="sm"
            data-testid="subscription-resume"
            disabled={busy}
            onClick={() => void apply("resume")}
          >
            {busy ? "Updating…" : "Keep plan"}
          </Button>
        </div>
      ) : !confirming ? (
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="subscription-cancel-open"
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
          data-testid="subscription-cancel-confirm-row"
          className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 dark:border-amber-400/30 dark:bg-amber-400/10"
        >
          <p className="text-xs text-muted-foreground">
            Your {planLabel} plan will stop renewing and paid access ends on{" "}
            <span data-testid="subscription-effective-date" className="font-medium text-foreground">
              {ends}
            </span>
            . <span className="font-medium text-foreground">Your account is not deleted</span> —
            your workflows, runs, integrations, members, and history all stay. You can turn
            this off any time before that date.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              data-testid="subscription-cancel-confirm"
              disabled={busy}
              onClick={() => void apply("cancel")}
            >
              {busy ? "Canceling…" : "Cancel subscription"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid="subscription-cancel-dismiss"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep plan
            </Button>
          </div>
        </div>
      )}

      {actionError && (
        <p role="alert" data-testid="subscription-action-error" className="text-xs text-destructive">
          {actionError}
        </p>
      )}
    </div>
  );
}
