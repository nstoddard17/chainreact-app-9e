import { planLimitsFor } from "@/core/billing/planPolicy";
import { CheckoutChoiceButton } from "./CheckoutChoiceButton";

/**
 * Personal Free → Pro upgrade affordance (Slice 4.PLATFORM-BILLING-UI-1; benefit copy added
 * in 4.PLATFORM-BILLING-PRO-VALUE-3 / CS-PRO-2; free-trial copy in PRO-TEAM-TRIAL-ENFORCEMENT-1).
 *
 * A thin wrapper around the generic PPT-4 `CheckoutChoiceButton` that starts a paid Pro
 * checkout for the viewer's own PERSONAL account (plan='pro'). The parent BillingSection
 * gates eligibility (personal account, owner/admin, not frozen, current plan free); billing
 * + Personal Pro are live (no feature-flag gate). This component only renders the copy +
 * button.
 *
 * Because the checkout account IS the personal account, `CheckoutChoiceButton` skips the
 * Personal-Pro choice dialog entirely (there is no separate-account conflict) and goes
 * straight to checkout. No plan/status is mutated here — Pro activates only after the CS-4
 * webhook confirms the payment. No Stripe id is read or shown, and the client never calls
 * Stripe directly.
 *
 * TRIAL COPY: `trialOffer` is the SERVER's sanitized decision (Pro is trial-eligible ∧ trials
 * configured on ∧ the account hasn't consumed its one trial). When `eligible`, the CTA reads
 * "Start Pro free trial" with honest "N-day free trial · no charge today, then the plan price"
 * copy. When NOT eligible (already used the one trial, or trials off), it reads "Upgrade to Pro /
 * billing starts today" — never a misleading "Start free trial". The server re-decides and
 * atomically claims the trial at checkout; this copy is display-only and fails safe to the
 * no-trial wording.
 *
 * Copy states Pro's REAL benefit — a higher monthly task cap — sourced from `planPolicy`
 * (the single source of the numbers; never hardcoded here) so it can't drift from the cap
 * the webhook actually applies. It stays honest that activation happens only after Stripe
 * payment + webhook confirmation.
 */
interface Props {
  /** The viewer's personal account being upgraded to Pro. */
  accountId: string;
  /** True when the account is frozen — disables the button (parent also hides this panel). */
  frozen: boolean;
  /** Sanitized server trial decision for this account's Pro upgrade; null → treat as no trial. */
  trialOffer?: { eligible: boolean; trialPeriodDays: number } | null;
  /**
   * BILLING-CHECKOUT-PROD-1 — the server knows platform checkout isn't configured, so the
   * CTA is disabled rather than offered as a click that can only fail. Defaults false
   * (available) so existing callers are unchanged.
   */
  checkoutUnavailable?: boolean;
}

export function PersonalUpgradePanel({
  accountId,
  frozen,
  trialOffer,
  checkoutUnavailable = false,
}: Props) {
  const proTasks = planLimitsFor("pro").taskLimit;
  const freeTasks = planLimitsFor("free").taskLimit;
  const trialEligible = Boolean(trialOffer?.eligible) && (trialOffer?.trialPeriodDays ?? 0) > 0;
  const trialDays = trialOffer?.trialPeriodDays ?? 0;
  return (
    <div data-testid="personal-upgrade-panel" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Upgrade your personal account to{" "}
        <span className="font-medium text-foreground">Pro</span>
        {proTasks !== null && freeTasks !== null ? (
          <>
            {" "}— <span className="font-medium text-foreground">
              {proTasks.toLocaleString("en-US")} monthly tasks
            </span>{" "}
            (up from {freeTasks.toLocaleString("en-US")} on Free)
          </>
        ) : null}
        .{" "}
        {trialEligible ? (
          <span data-testid="personal-upgrade-trial-copy">
            Start a{" "}
            <span className="font-medium text-foreground">{trialDays}-day free trial</span> — no
            charge today. You&apos;ll be billed the Pro price when the trial ends unless you cancel,
            and each account gets one free trial. Checkout opens Stripe; Pro activates after your
            trial starts.
          </span>
        ) : (
          <span data-testid="personal-upgrade-no-trial-copy">
            Billing starts today. Checkout opens Stripe; Pro activates only after your payment is
            confirmed. Your plan and status don&apos;t change until then.
          </span>
        )}
      </p>
      <CheckoutChoiceButton
        checkoutAccountId={accountId}
        plan="pro"
        personalAccountId={accountId}
        label={trialEligible ? "Start Pro free trial" : "Upgrade to Pro"}
        frozen={frozen}
        unavailable={checkoutUnavailable}
      />
    </div>
  );
}
