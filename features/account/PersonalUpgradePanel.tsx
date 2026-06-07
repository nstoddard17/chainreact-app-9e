import { CheckoutChoiceButton } from "./CheckoutChoiceButton";

/**
 * Personal Free → Pro upgrade affordance (Slice 4.PLATFORM-BILLING-UI-1).
 *
 * A thin wrapper around the generic PPT-4 `CheckoutChoiceButton` that starts a paid Pro
 * checkout for the viewer's own PERSONAL account (plan='pro'). The parent BillingSection
 * gates eligibility (personal account, owner/admin, not frozen, current plan free,
 * ENABLE_PLATFORM_BILLING on); this component only renders the copy + button.
 *
 * Because the checkout account IS the personal account, `CheckoutChoiceButton` skips the
 * Personal-Pro choice dialog entirely (there is no separate-account conflict) and goes
 * straight to checkout. No plan/status is mutated here — Pro activates only after the CS-4
 * webhook confirms the payment. No Stripe id is read or shown, and the client never calls
 * Stripe directly.
 *
 * Copy is deliberately mechanics-only (it does NOT claim extra capacity): Pro currently
 * shares the Free caps in `core/billing/planPolicy.ts`, so promising more would be fake UI.
 */
interface Props {
  /** The viewer's personal account being upgraded to Pro. */
  accountId: string;
  /** True when the account is frozen — disables the button (parent also hides this panel). */
  frozen: boolean;
}

export function PersonalUpgradePanel({ accountId, frozen }: Props) {
  return (
    <div data-testid="personal-upgrade-panel" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Upgrade your personal account to{" "}
        <span className="font-medium text-foreground">Pro</span>. Checkout opens Stripe; Pro
        activates only after your payment is confirmed. Your plan and status don&apos;t change
        until then.
      </p>
      <CheckoutChoiceButton
        checkoutAccountId={accountId}
        plan="pro"
        personalAccountId={accountId}
        label="Upgrade to Pro"
        frozen={frozen}
      />
    </div>
  );
}
