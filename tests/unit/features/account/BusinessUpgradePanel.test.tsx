/**
 * Slice 4.BILLING-BUSINESS-UPGRADE-5 / BU-4 — Business upgrade panel. Mocks the generic
 * CheckoutChoiceButton to capture the props the panel forwards (plan='business', the Team
 * account id, and the viewer's personal account id for the Personal-Pro choice).
 */
import { render, screen } from "@testing-library/react";
import { BusinessUpgradePanel } from "@/features/account/BusinessUpgradePanel";

const mockButton = jest.fn();
jest.mock("@/features/account/CheckoutChoiceButton", () => ({
  CheckoutChoiceButton: (props: Record<string, unknown>) => {
    mockButton(props);
    return <button data-testid="ccb">{props.label as string}</button>;
  },
}));

beforeEach(() => mockButton.mockReset());

it("forwards plan='business' + the Team account + the viewer's personal account id", () => {
  render(<BusinessUpgradePanel accountId="team-1" personalAccountId="personal-1" frozen={false} />);
  expect(mockButton).toHaveBeenCalledWith(
    expect.objectContaining({
      checkoutAccountId: "team-1",
      plan: "business",
      personalAccountId: "personal-1",
      label: "Upgrade to Business",
      frozen: false,
    }),
  );
  expect(screen.getByTestId("ccb")).toHaveTextContent("Upgrade to Business");
});

it("explains the capacity increase + Personal Pro choice, and renders no Stripe id", () => {
  const { container } = render(
    <BusinessUpgradePanel accountId="team-1" personalAccountId="personal-1" frozen={false} />,
  );
  const panel = screen.getByTestId("business-upgrade-panel");
  expect(panel).toHaveTextContent(/25 members/i);
  expect(panel).toHaveTextContent(/250 folders/i);
  expect(panel).toHaveTextContent(/Personal Pro/i);
  expect(container.innerHTML).not.toMatch(/cus_|sub_/);
});

// PRO-TEAM-TRIAL-ENFORCEMENT-1 — Business is never trial-eligible; never advertise a free trial.
it("never advertises a Business free trial — states billing starts today", () => {
  render(<BusinessUpgradePanel accountId="team-1" personalAccountId="personal-1" frozen={false} />);
  expect(screen.getByTestId("business-upgrade-no-trial-copy")).toHaveTextContent(
    /no free trial — billing starts today/i,
  );
  // The CTA never offers a trial; it is an upgrade, not a "Start free trial".
  expect(mockButton).toHaveBeenCalledWith(expect.objectContaining({ label: "Upgrade to Business" }));
  expect(screen.getByTestId("ccb")).not.toHaveTextContent(/free trial/i);
});
