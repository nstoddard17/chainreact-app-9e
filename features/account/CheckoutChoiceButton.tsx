"use client";

import { useState } from "react";
import {
  getPersonalBillingState,
  setPersonalCancelAtPeriodEnd,
  type PersonalPlanStateView,
} from "@/lib/api/personalBilling";
import { startCheckout, type CheckoutPlan } from "@/lib/api/billingCheckout";
import type { BillingInterval } from "@/core/billing/planPolicy";
import { AccountApiError } from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";

/**
 * Start-paid-checkout button with the Personal-Pro choice dialog
 * (Slice 4.BILLING-PERSONAL-PRO-TEAM-CHOICE-4 / PPT-4).
 *
 * Reusable + generic over plan (Team today; Business when that path exists). When the
 * caller starts a paid Team/Business checkout AND their PERSONAL account is active paid
 * Pro, it first offers an explicit, skippable choice — Keep Personal Pro (default; no
 * personal mutation) or Downgrade Personal to Free at period end — then proceeds to the
 * existing CS-3 checkout route. There is NO existing checkout-start UI to wrap; this
 * component IS the start affordance. CS-7 mounts it in the billing UI with the proper
 * paid-vs-free eligibility logic.
 *
 * Conservative: the only mutation is the existing PPT-1 cancel-at-period-end route
 * (period-end, no data deleted, plan/status stay webhook-authoritative). No Stripe id is
 * read or shown; the redirect target is the Stripe-hosted Checkout url only. A personal-
 * plan read failure FAILS SAFE — it skips the dialog and proceeds to checkout rather than
 * blocking the purchase, and never surfaces a raw Stripe/DB error.
 *
 * Upgrading the personal account itself (checkoutAccountId === personalAccountId) skips
 * the choice entirely — there is no Personal-Pro-vs-Team conflict to resolve.
 */
interface Props {
  /** Account being upgraded (team/business; or the personal account for a Pro upgrade). */
  checkoutAccountId: string;
  plan: CheckoutPlan;
  /** Billing interval to purchase. Omitted → monthly (the server default). Wired so a future
   *  interval selector can pass `annual` without further plumbing. */
  interval?: BillingInterval;
  /** The caller's personal account id — read to decide whether to offer the choice. */
  personalAccountId: string;
  label?: string;
  /** True when the checkout account is frozen — the trigger is disabled. */
  frozen?: boolean;
  /**
   * True when the SERVER already knows platform checkout is not configured
   * (BILLING-CHECKOUT-PROD-1). The button is disabled and relabelled rather than offering a
   * click that can only 503 — an honest dead CTA beats a working-looking one. This is a
   * server-computed hint, NOT the enforcement point: the route re-checks and returns a typed
   * response regardless, so a stale/forged client value cannot start an unconfigured checkout.
   */
  unavailable?: boolean;
  /** Redirect seam (injectable for tests). Defaults to window.location.assign. */
  redirect?: (url: string) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "the end of the current period";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "the end of the current period";
  return new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function CheckoutChoiceButton({
  checkoutAccountId,
  plan,
  interval,
  personalAccountId,
  label,
  frozen = false,
  unavailable = false,
  redirect,
}: Props) {
  // When set, the choice dialog is open with the read personal state.
  const [choice, setChoice] = useState<PersonalPlanStateView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choiceApplies = checkoutAccountId !== personalAccountId;
  const go = redirect ?? ((url: string) => window.location.assign(url));

  async function proceedToCheckout() {
    try {
      // Pass interval only when set so the common monthly path keeps the 2-arg call shape.
      const { url } = interval
        ? await startCheckout(checkoutAccountId, plan, interval)
        : await startCheckout(checkoutAccountId, plan);
      go(url);
    } catch (err) {
      setError(
        err instanceof AccountApiError ? err.message : "Couldn't start checkout. Try again.",
      );
      setBusy(false);
    }
  }

  async function onStart() {
    if (frozen || busy || unavailable) return;
    setBusy(true);
    setError(null);
    if (!choiceApplies) {
      await proceedToCheckout();
      return;
    }
    let state: PersonalPlanStateView;
    try {
      state = await getPersonalBillingState(personalAccountId);
    } catch {
      // Fail safe: a non-critical personal-plan read failure must not block the purchase.
      await proceedToCheckout();
      return;
    }
    if (state.isPaidPersonalPro) {
      setChoice(state); // open the dialog
      setBusy(false);
      return;
    }
    await proceedToCheckout();
  }

  async function onKeep() {
    setChoice(null);
    setBusy(true);
    setError(null);
    await proceedToCheckout(); // no personal mutation
  }

  async function onDowngrade() {
    if (!choice?.downgrade.allowed) return;
    setBusy(true);
    setError(null);
    try {
      await setPersonalCancelAtPeriodEnd(personalAccountId, true);
    } catch (err) {
      setError(
        err instanceof AccountApiError
          ? err.message
          : "Couldn't update your personal plan. Try again.",
      );
      setBusy(false);
      return;
    }
    setChoice(null);
    await proceedToCheckout();
  }

  function onDismiss() {
    setChoice(null);
    setBusy(false);
    setError(null);
  }

  const ends = choice ? formatDate(choice.currentPeriodEnd) : "";
  const downgradeAllowed = choice?.downgrade.allowed ?? false;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          size="sm"
          data-testid="checkout-choice-trigger"
          disabled={frozen || busy || unavailable}
          onClick={() => void onStart()}
        >
          {unavailable
            ? "Billing temporarily unavailable"
            : busy && !choice
              ? "Starting…"
              : (label ?? "Upgrade")}
        </Button>
      </div>

      {unavailable && (
        <p
          data-testid="checkout-unavailable-note"
          className="text-xs text-muted-foreground"
        >
          Checkout isn&apos;t available right now. Your account was not changed — please try
          again later.
        </p>
      )}

      {choice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Personal Pro choice"
          data-testid="checkout-choice-dialog"
          className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground">
              You have a Personal Pro subscription
            </span>
            <p className="text-xs text-muted-foreground">
              This new plan is billed separately on its own account — your Personal Pro
              subscription is unaffected unless you choose to downgrade it.
            </p>
          </div>

          {/* Default, non-destructive choice. */}
          <Button
            type="button"
            size="sm"
            data-testid="checkout-choice-keep"
            disabled={busy}
            onClick={() => void onKeep()}
          >
            {busy ? "Continuing…" : "Keep Personal Pro & continue"}
          </Button>

          {downgradeAllowed ? (
            <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 dark:border-amber-400/30 dark:bg-amber-400/10">
              <p className="text-xs text-muted-foreground">
                Or downgrade your personal account to Free at the end of its current period
                ({ends}). <span className="font-medium text-foreground">No data is deleted</span> —
                your personal workflows, folders, and keys stay. Pro access continues until
                then. Once confirmed, this cancellation stands even if you don&apos;t finish this
                checkout.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="checkout-choice-downgrade"
                disabled={busy}
                onClick={() => void onDowngrade()}
              >
                {busy ? "Working…" : "Downgrade Personal to Free & continue"}
              </Button>
            </div>
          ) : (
            <div
              data-testid="checkout-choice-blocked"
              className="flex flex-col gap-1 rounded-md border border-border p-3"
            >
              <p className="text-xs text-muted-foreground">
                You can&apos;t downgrade your personal account to Free yet:
              </p>
              <ul data-testid="checkout-choice-blockers" className="flex flex-col gap-1">
                {(choice?.downgrade.blockers ?? []).map((b) => (
                  <li key={b.kind} className="text-xs text-amber-600 dark:text-amber-400">
                    {b.kind === "members" ? "Members" : "Folders"}: {b.current} (Free allows{" "}
                    {b.limit}).
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid="checkout-choice-cancel"
              disabled={busy}
              onClick={onDismiss}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" data-testid="checkout-choice-error" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
