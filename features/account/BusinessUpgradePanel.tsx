import { CheckoutChoiceButton } from "./CheckoutChoiceButton";

/**
 * Team → Business upgrade affordance (Slice 4.BILLING-BUSINESS-UPGRADE-5 / BU-4).
 *
 * A thin wrapper around the generic PPT-4 `CheckoutChoiceButton` that starts a paid
 * Business checkout for the active TEAM account (plan='business'). The parent
 * BillingSection gates eligibility (Team account, owner/admin, not frozen, flag ON); this
 * component only renders the copy + button. The actual type/plan flip happens later via the
 * BU-3 webhook + BU-1 RPC — no plan/type is mutated here, no Stripe id is read or shown, and
 * the client never calls Stripe directly.
 *
 * Passing the viewer's personal account id lets `CheckoutChoiceButton` run the Personal-Pro
 * choice dialog (Keep / Downgrade-at-period-end) before the Business checkout when the viewer
 * separately has Personal Pro.
 */
interface Props {
  /** The active Team account being upgraded. */
  accountId: string;
  /** The viewer's personal account id (drives the Personal-Pro choice dialog). */
  personalAccountId: string;
  /** True when the account is frozen — disables the button (parent also hides this panel). */
  frozen: boolean;
}

export function BusinessUpgradePanel({ accountId, personalAccountId, frozen }: Props) {
  return (
    <div data-testid="business-upgrade-panel" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Business raises this account&apos;s capacity to{" "}
        <span className="font-medium text-foreground">25 members</span> and{" "}
        <span className="font-medium text-foreground">250 folders</span>. The upgrade
        completes after Stripe checkout and webhook confirmation.{" "}
        {/* PRO-TEAM-TRIAL-ENFORCEMENT-1: Business is never trial-eligible — say so plainly and
            never advertise a free trial here. */}
        <span data-testid="business-upgrade-no-trial-copy" className="font-medium text-foreground">
          Business has no free trial — billing starts today.
        </span>{" "}
        If you have a Personal Pro subscription, you can keep it or schedule it to downgrade to
        Free at period end.
      </p>
      <CheckoutChoiceButton
        checkoutAccountId={accountId}
        plan="business"
        personalAccountId={personalAccountId}
        label="Upgrade to Business"
        frozen={frozen}
      />
    </div>
  );
}
