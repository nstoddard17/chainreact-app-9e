/**
 * Slice 4.PLATFORM-BILLING-UI-1 — Personal Free → Pro upgrade panel. Mocks the generic
 * CheckoutChoiceButton to capture the props the panel forwards (plan='pro', the personal
 * account as BOTH checkout + personal id — which makes CheckoutChoiceButton skip the
 * Personal-Pro choice dialog). The click → startCheckout(accountId, 'pro') behavior itself
 * is proven by CheckoutChoiceButton.test ("skips the choice when upgrading the personal
 * account itself"). Copy is mechanics-only; no Stripe id ever appears.
 */
import { render, screen } from "@testing-library/react";
import { PersonalUpgradePanel } from "@/features/account/PersonalUpgradePanel";

const mockButton = jest.fn();
jest.mock("@/features/account/CheckoutChoiceButton", () => ({
  CheckoutChoiceButton: (props: Record<string, unknown>) => {
    mockButton(props);
    return (
      <button data-testid="ccb" data-plan={props.plan as string}>
        {props.label as string}
      </button>
    );
  },
}));

beforeEach(() => mockButton.mockReset());

it("forwards plan='pro' with the personal account as both checkout + personal id (no dialog)", () => {
  render(<PersonalUpgradePanel accountId="personal-1" frozen={false} />);
  expect(mockButton).toHaveBeenCalledWith(
    expect.objectContaining({
      checkoutAccountId: "personal-1",
      plan: "pro",
      personalAccountId: "personal-1",
      label: "Upgrade to Pro",
      frozen: false,
    }),
  );
  expect(screen.getByTestId("ccb")).toHaveAttribute("data-plan", "pro");
  expect(screen.getByTestId("ccb")).toHaveTextContent("Upgrade to Pro");
});

it("states the real Pro benefit (2,000 monthly tasks) + honest activation copy, no Stripe id", () => {
  const { container } = render(<PersonalUpgradePanel accountId="personal-1" frozen={false} />);
  const panel = screen.getByTestId("personal-upgrade-panel");
  // Copy states the real task-cap benefit (sourced from planPolicy), not a fake one.
  expect(panel).toHaveTextContent(/2,000 monthly tasks/i);
  expect(panel).toHaveTextContent(/up from 100 on Free/i);
  // …and stays honest that activation only happens after Stripe payment + webhook.
  expect(panel).toHaveTextContent(/Checkout opens Stripe/i);
  expect(panel).toHaveTextContent(/activates only after your payment is confirmed/i);
  expect(container.innerHTML).not.toMatch(/cus_|sub_/);
});

it("forwards the frozen flag so the trigger is disabled on a frozen account", () => {
  render(<PersonalUpgradePanel accountId="personal-1" frozen={true} />);
  expect(mockButton).toHaveBeenCalledWith(expect.objectContaining({ frozen: true }));
});

// PRO-TEAM-TRIAL-ENFORCEMENT-1 — trial-aware CTA + copy.
it("eligible account: shows 'Start Pro free trial' + honest one-time free-trial copy", () => {
  render(
    <PersonalUpgradePanel
      accountId="personal-1"
      frozen={false}
      trialOffer={{ eligible: true, trialPeriodDays: 14 }}
    />,
  );
  expect(mockButton).toHaveBeenCalledWith(
    expect.objectContaining({ label: "Start Pro free trial" }),
  );
  const panel = screen.getByTestId("personal-upgrade-panel");
  expect(panel).toHaveTextContent(/14-day free trial/i);
  expect(panel).toHaveTextContent(/no charge today/i);
  expect(panel).toHaveTextContent(/one free trial/i);
});

it("ineligible account (already used its trial): 'Upgrade to Pro' + 'Billing starts today', no free-trial claim", () => {
  render(
    <PersonalUpgradePanel
      accountId="personal-1"
      frozen={false}
      trialOffer={{ eligible: false, trialPeriodDays: 0 }}
    />,
  );
  expect(mockButton).toHaveBeenCalledWith(expect.objectContaining({ label: "Upgrade to Pro" }));
  const panel = screen.getByTestId("personal-upgrade-panel");
  expect(panel).toHaveTextContent(/Billing starts today/i);
  expect(panel).not.toHaveTextContent(/free trial/i);
});
